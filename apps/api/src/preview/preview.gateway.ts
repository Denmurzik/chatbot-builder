import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { parsePreviewChatId, type ChatEvent } from '@chatbot/model';
import type { EventQueue } from '@chatbot/queue';
import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedAuthor } from '../auth/current-author.decorator';
import { SESSION_COOKIE_NAME } from '../config';
import { PrismaService } from '../prisma/prisma.module';
import { EVENT_QUEUE } from '../queue/queue.module';
import { PreviewSubscriber } from './preview-subscriber';

interface PreviewSocketData {
  author?: AuthenticatedAuthor;
  chatId?: string;
  sessionId?: string;
}

type PreviewSocket = Socket<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  PreviewSocketData
>;

interface StartPayload {
  projectId?: unknown;
  sessionId?: unknown;
}

interface InputPayload {
  text?: unknown;
}

interface ButtonPayload {
  callbackData?: unknown;
}

const MAX_SESSION_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 4096;
const MAX_CALLBACK_DATA_LENGTH = 64;
const ENQUEUE_ERROR_MESSAGE = 'Не удалось отправить событие';

// Извлекает hostname (без порта) из заголовка Host или первой части X-Forwarded-Host
function extractHostname(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  if (!first) return null;
  try {
    const parsed = new URL(`http://${first}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Защита в глубину от CSWSH: при наличии заголовка Origin сравниваем hostname (nginx шлёт Host без порта)
function isSameOriginRequest(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawForwarded = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const targetHostname = extractHostname(rawForwarded?.trim() ? rawForwarded : req.headers.host);
  if (!targetHostname) return false;
  try {
    return new URL(origin).hostname.toLowerCase() === targetHostname;
  } catch {
    return false;
  }
}

// Извлекает значение cookie по имени из заголовка Cookie без дополнительных зависимостей
function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const rawValue = trimmed.slice(prefix.length);
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return null;
}

// Socket.IO-шлюз превью сценария: аутентификация по cookie session, комнаты по chatId и проксирование событий в очередь
@WebSocketGateway({
  namespace: '/preview',
  path: '/api/socket.io',
  allowRequest: (req: IncomingMessage, callback: (err: string | null | undefined, success: boolean) => void) => {
    if (isSameOriginRequest(req)) {
      callback(null, true);
    } else {
      callback('forbidden_origin', false);
    }
  },
})
export class PreviewGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(PreviewGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    @Inject(EVENT_QUEUE) private readonly eventQueue: EventQueue,
    private readonly subscriber: PreviewSubscriber,
  ) {}

  afterInit(server: Namespace): void {
    this.subscriber.setHandler((chatId, event) => {
      server.to(chatId).emit('preview', event);
    });

    server.use((socket: PreviewSocket, next) => {
      const token = parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
      if (!token) {
        next(new Error('unauthorized'));
        return;
      }
      this.authService
        .authenticate(token)
        .then((author) => {
          socket.data.author = author;
          next();
        })
        .catch(() => {
          next(new Error('unauthorized'));
        });
    });
  }

  handleDisconnect(client: PreviewSocket): void {
    client.data.chatId = undefined;
    client.data.sessionId = undefined;
  }

  @SubscribeMessage('start')
  async handleStart(
    @ConnectedSocket() client: PreviewSocket,
    @MessageBody() payload: StartPayload | undefined,
  ): Promise<{ chatId: string } | { error: string }> {
    const author = client.data.author;
    if (!author) {
      this.scheduleDisconnect(client);
      return { error: 'unauthorized' };
    }

    const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : '';
    if (!projectId) {
      this.scheduleDisconnect(client);
      return { error: 'forbidden' };
    }

    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, authorId: author.id },
      select: { id: true },
    });
    if (!project) {
      this.scheduleDisconnect(client);
      return { error: 'forbidden' };
    }

    const sessionId = await this.resolveSessionId(author.id, projectId, payload?.sessionId);
    const chatId = `preview:${projectId}:${sessionId}`;

    if (client.data.chatId && client.data.chatId !== chatId) {
      await client.leave(client.data.chatId);
    }
    await client.join(chatId);
    client.data.chatId = chatId;
    client.data.sessionId = sessionId;

    const enqueued = await this.enqueueEvent(client, {
      type: 'START_COMMAND',
      channel: 'PREVIEW',
      botId: null,
      chatId,
      userId: `author:${author.id}`,
    });
    if (!enqueued) {
      await client.leave(chatId);
      client.data.chatId = undefined;
      client.data.sessionId = undefined;
      return { error: ENQUEUE_ERROR_MESSAGE };
    }

    return { chatId };
  }

  @SubscribeMessage('input')
  async handleInput(
    @ConnectedSocket() client: PreviewSocket,
    @MessageBody() payload: InputPayload | undefined,
  ): Promise<{ ok: true } | { error: string }> {
    const session = this.getActiveSession(client);
    if (!session) return { error: 'Сеанс превью не запущен' };

    if (typeof payload?.text !== 'string') {
      return { error: 'Текст сообщения должен быть строкой' };
    }
    if (payload.text.length > MAX_TEXT_LENGTH) {
      return { error: `Текст сообщения не должен превышать ${MAX_TEXT_LENGTH} символов` };
    }

    const enqueued = await this.enqueueEvent(client, {
      type: 'TEXT_MESSAGE',
      channel: 'PREVIEW',
      botId: null,
      chatId: session.chatId,
      userId: `author:${session.author.id}`,
      payload: payload.text,
    });
    if (!enqueued) return { error: ENQUEUE_ERROR_MESSAGE };

    return { ok: true };
  }

  @SubscribeMessage('button')
  async handleButton(
    @ConnectedSocket() client: PreviewSocket,
    @MessageBody() payload: ButtonPayload | undefined,
  ): Promise<{ ok: true } | { error: string }> {
    const session = this.getActiveSession(client);
    if (!session) return { error: 'Сеанс превью не запущен' };

    const callbackData = typeof payload?.callbackData === 'string' ? payload.callbackData : '';
    if (callbackData.length > MAX_CALLBACK_DATA_LENGTH) {
      return { error: `Данные кнопки не должны превышать ${MAX_CALLBACK_DATA_LENGTH} символов` };
    }
    const sep = callbackData.lastIndexOf(':');
    if (!callbackData || sep <= 0) {
      return { error: 'Некорректные данные кнопки' };
    }

    const sourceBlockId = callbackData.slice(0, sep);
    const enqueued = await this.enqueueEvent(client, {
      type: 'BUTTON_PRESS',
      channel: 'PREVIEW',
      botId: null,
      chatId: session.chatId,
      userId: `author:${session.author.id}`,
      payload: callbackData,
      sourceBlockId,
    });
    if (!enqueued) return { error: ENQUEUE_ERROR_MESSAGE };

    return { ok: true };
  }

  @SubscribeMessage('restart')
  async handleRestart(
    @ConnectedSocket() client: PreviewSocket,
  ): Promise<{ ok: true } | { error: string }> {
    const session = this.getActiveSession(client);
    if (!session) return { error: 'Сеанс превью не запущен' };

    const enqueued = await this.enqueueEvent(client, {
      type: 'START_COMMAND',
      channel: 'PREVIEW',
      botId: null,
      chatId: session.chatId,
      userId: `author:${session.author.id}`,
    });
    if (!enqueued) return { error: ENQUEUE_ERROR_MESSAGE };

    return { ok: true };
  }

  private getActiveSession(
    client: PreviewSocket,
  ): { author: AuthenticatedAuthor; chatId: string; sessionId: string } | null {
    const { author, chatId, sessionId } = client.data;
    if (!author || !chatId || !sessionId) return null;
    return { author, chatId, sessionId };
  }

  // Переиспользует sessionId, если для этого проекта и автора уже существует контекст превью
  private async resolveSessionId(
    authorId: string,
    projectId: string,
    rawSessionId: unknown,
  ): Promise<string> {
    if (typeof rawSessionId === 'string') {
      const candidate = rawSessionId.trim();
      if (candidate.length > 0 && candidate.length <= MAX_SESSION_ID_LENGTH) {
        const candidateChatId = `preview:${projectId}:${candidate}`;
        const parsed = parsePreviewChatId(candidateChatId);
        if (parsed && parsed.projectId === projectId && parsed.sessionId === candidate) {
          const existing = await this.prisma.client.dialogContext.findFirst({
            where: {
              botId: null,
              chatId: candidateChatId,
              userId: `author:${authorId}`,
              channel: 'PREVIEW',
            },
            select: { id: true },
          });
          if (existing) return candidate;
        }
      }
    }
    return randomUUID();
  }

  private async enqueueEvent(client: PreviewSocket, event: ChatEvent): Promise<boolean> {
    const jobId = `preview-${client.data.sessionId}-${randomUUID()}`;
    try {
      await this.eventQueue.enqueue(event, jobId);
      return true;
    } catch (error) {
      this.logger.error(
        `Ошибка постановки события превью ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  // Откладываем разрыв соединения, чтобы клиент успел получить ответ ack с ошибкой
  private scheduleDisconnect(client: PreviewSocket): void {
    setTimeout(() => {
      client.disconnect(true);
    }, 10);
  }
}
