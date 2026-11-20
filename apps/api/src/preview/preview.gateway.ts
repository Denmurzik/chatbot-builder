import { randomUUID } from 'node:crypto';
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
  seq: number;
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
@WebSocketGateway({ namespace: '/preview', path: '/api/socket.io' })
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
          socket.data.seq = 0;
          next();
        })
        .catch(() => {
          next(new Error('unauthorized'));
        });
    });
  }

  handleDisconnect(client: PreviewSocket): void {
    const chatId = client.data.chatId;
    if (chatId) {
      void client.leave(chatId);
      client.data.chatId = undefined;
      client.data.sessionId = undefined;
    }
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

    await this.enqueueEvent(client, {
      type: 'START_COMMAND',
      channel: 'PREVIEW',
      botId: null,
      chatId,
      userId: `author:${author.id}`,
    });

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

    await this.enqueueEvent(client, {
      type: 'TEXT_MESSAGE',
      channel: 'PREVIEW',
      botId: null,
      chatId: session.chatId,
      userId: `author:${session.author.id}`,
      payload: payload.text,
    });

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
    const sep = callbackData.lastIndexOf(':');
    if (!callbackData || sep <= 0) {
      return { error: 'Некорректные данные кнопки' };
    }

    const sourceBlockId = callbackData.slice(0, sep);
    await this.enqueueEvent(client, {
      type: 'BUTTON_PRESS',
      channel: 'PREVIEW',
      botId: null,
      chatId: session.chatId,
      userId: `author:${session.author.id}`,
      payload: callbackData,
      sourceBlockId,
    });

    return { ok: true };
  }

  @SubscribeMessage('restart')
  async handleRestart(
    @ConnectedSocket() client: PreviewSocket,
  ): Promise<{ ok: true } | { error: string }> {
    const session = this.getActiveSession(client);
    if (!session) return { error: 'Сеанс превью не запущен' };

    await this.enqueueEvent(client, {
      type: 'START_COMMAND',
      channel: 'PREVIEW',
      botId: null,
      chatId: session.chatId,
      userId: `author:${session.author.id}`,
    });

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

  private async enqueueEvent(client: PreviewSocket, event: ChatEvent): Promise<void> {
    client.data.seq = (client.data.seq ?? 0) + 1;
    const jobId = `preview-${client.data.sessionId}-${client.data.seq}`;
    try {
      await this.eventQueue.enqueue(event, jobId);
    } catch (error) {
      this.logger.error(
        `Ошибка постановки события превью ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  // Откладываем разрыв соединения, чтобы клиент успел получить ответ ack с ошибкой
  private scheduleDisconnect(client: PreviewSocket): void {
    setTimeout(() => {
      client.disconnect(true);
    }, 10);
  }
}
