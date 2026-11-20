import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { parsePreviewChatId, type ChatEvent, type PreviewEvent } from '@chatbot/model';
import { dialogKey, partitionOf, queueName, type EventQueue } from '@chatbot/queue';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import IORedis from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { EVENT_QUEUE } from '../src/queue/queue.module';
import { createIsolatedTestDb, type IsolatedTestDb } from './test-db';

interface StartAck {
  chatId?: string;
  error?: string;
}

interface ActionAck {
  ok?: boolean;
  error?: string;
}

// Подключает Socket.IO-клиент к namespace /preview с переданной строкой Cookie и доп. заголовками
function connectPreview(
  port: number,
  cookie?: string,
  extraHeaders?: Record<string, string>,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    };
    const socket = io(`http://127.0.0.1:${port}/preview`, {
      path: '/api/socket.io',
      transports: ['websocket'],
      reconnection: false,
      ...(Object.keys(headers).length > 0 ? { extraHeaders: headers } : {}),
    });
    const onConnect = () => {
      cleanup();
      resolve(socket);
    };
    const onError = (err: Error) => {
      cleanup();
      socket.disconnect();
      reject(err);
    };
    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
}

// Отправляет событие с подтверждением (ack) и тайм-аутом
function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Тайм-аут ack для ${event}`)), 5000);
    const cb = (res: T) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) {
      socket.emit(event, cb);
    } else {
      socket.emit(event, payload, cb);
    }
  });
}

// Ожидает следующее событие preview на сокете
function waitPreviewEvent(socket: Socket, timeoutMs = 3000): Promise<PreviewEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('preview', onEvent);
      reject(new Error('Тайм-аут ожидания события preview'));
    }, timeoutMs);
    const onEvent = (event: PreviewEvent) => {
      clearTimeout(timer);
      socket.off('preview', onEvent);
      resolve(event);
    };
    socket.on('preview', onEvent);
  });
}

describe('Socket.IO-шлюз превью (интеграционные тесты)', () => {
  let db: IsolatedTestDb;
  let app: INestApplication;
  let port: number;
  let redisPub: IORedis;
  let eventQueue: EventQueue;
  let enqueueSpy: ReturnType<typeof vi.spyOn>;
  const openSockets: Socket[] = [];

  const prevEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    TELEGRAM_POLLING: process.env.TELEGRAM_POLLING,
    NODE_ENV: process.env.NODE_ENV,
    QUEUE_PREFIX: process.env.QUEUE_PREFIX,
    VAULT_KEY: process.env.VAULT_KEY,
    VAULT_HASH_KEY: process.env.VAULT_HASH_KEY,
  };

  beforeAll(async () => {
    db = await createIsolatedTestDb();
    process.env.DATABASE_URL = db.databaseUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-preview-tests';
    process.env.TELEGRAM_POLLING = '0';
    process.env.NODE_ENV = 'test';
    process.env.QUEUE_PREFIX = `preview_test_${randomBytes(4).toString('hex')}`;
    process.env.VAULT_KEY ??= Buffer.alloc(32, 1).toString('base64');
    process.env.VAULT_HASH_KEY ??= Buffer.alloc(32, 2).toString('base64');

    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) throw new Error('Не задана переменная окружения REDIS_URL');
    redisPub = new IORedis(redisUrl);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('Не удалось получить порт HTTP-сервера');
    }
    port = address.port;

    eventQueue = app.get<EventQueue>(EVENT_QUEUE);
    enqueueSpy = vi.spyOn(eventQueue, 'enqueue');
  }, 120000);

  afterAll(async () => {
    await app?.close();
    if (redisPub) {
      try {
        await redisPub.quit();
      } catch {
        redisPub.disconnect();
      }
    }
    await db?.destroy();
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(async () => {
    await db.truncateAll();
    enqueueSpy.mockClear();
  });

  afterEach(() => {
    while (openSockets.length > 0) {
      const s = openSockets.pop();
      s?.disconnect();
    }
  });

  async function registerAuthorWithProject(email: string, projectName = 'Проект') {
    const agent = request.agent(app.getHttpServer());
    const reg = await agent
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    const setCookie = reg.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const sessionCookie = cookies.find((c) => c.startsWith('session='));
    if (!sessionCookie) throw new Error('Cookie session не установлена');
    const cookieHeader = sessionCookie.split(';')[0];

    const project = await agent.post('/api/projects').send({ name: projectName }).expect(201);
    return {
      authorId: reg.body.id as string,
      projectId: project.body.id as string,
      cookieHeader,
    };
  }

  async function openClient(cookie: string): Promise<Socket> {
    const socket = await connectPreview(port, cookie);
    openSockets.push(socket);
    return socket;
  }

  it('отклоняет подключение без cookie session и с невалидным токеном', async () => {
    await expect(connectPreview(port)).rejects.toThrow('unauthorized');
    await expect(connectPreview(port, 'session=not-a-valid-jwt')).rejects.toThrow('unauthorized');
  });

  it('возвращает ошибку и отключает сокет при попытке открыть чужой или несуществующий проект', async () => {
    const owner = await registerAuthorWithProject('owner@example.com');
    const stranger = await registerAuthorWithProject('stranger@example.com');

    const socket = await openClient(stranger.cookieHeader);
    const disconnected = new Promise<void>((resolve) => {
      socket.once('disconnect', () => resolve());
    });

    const ack = await emitAck<StartAck>(socket, 'start', { projectId: owner.projectId });
    expect(ack).toEqual({ error: 'forbidden' });
    await disconnected;
    expect(enqueueSpy).not.toHaveBeenCalled();

    const socket2 = await openClient(owner.cookieHeader);
    const disconnected2 = new Promise<void>((resolve) => {
      socket2.once('disconnect', () => resolve());
    });
    const ack2 = await emitAck<StartAck>(socket2, 'start', {
      projectId: '00000000-0000-0000-0000-000000000000',
    });
    expect(ack2).toEqual({ error: 'forbidden' });
    await disconnected2;
  });

  it('start, input, button и restart ставят нужные события в очередь с chatId сеанса', async () => {
    const { authorId, projectId, cookieHeader } =
      await registerAuthorWithProject('author@example.com');
    const socket = await openClient(cookieHeader);

    // До start события ввода не принимаются
    const beforeStart = await emitAck<ActionAck>(socket, 'input', { text: 'рано' });
    expect(beforeStart.error).toBeTruthy();
    expect(enqueueSpy).not.toHaveBeenCalled();

    const startAck = await emitAck<StartAck>(socket, 'start', { projectId });
    expect(startAck.error).toBeUndefined();
    expect(typeof startAck.chatId).toBe('string');

    const parsed = parsePreviewChatId(startAck.chatId!);
    expect(parsed).not.toBeNull();
    expect(parsed!.projectId).toBe(projectId);
    const { sessionId } = parsed!;

    const inputAck = await emitAck<ActionAck>(socket, 'input', {
      text: 'Привет',
      // Попытка подмены chatId в payload должна игнорироваться
      chatId: 'preview:evil:evil',
    });
    expect(inputAck).toEqual({ ok: true });

    const buttonAck = await emitAck<ActionAck>(socket, 'button', {
      callbackData: 'block-question-1:2',
    });
    expect(buttonAck).toEqual({ ok: true });

    const restartAck = await emitAck<ActionAck>(socket, 'restart');
    expect(restartAck).toEqual({ ok: true });

    expect(enqueueSpy).toHaveBeenCalledTimes(4);

    const calls = enqueueSpy.mock.calls as Array<[ChatEvent, string]>;
    const jobIdPattern = new RegExp(`^preview-${sessionId}-[0-9a-f-]{36}$`);
    expect(calls[0]).toEqual([
      {
        type: 'START_COMMAND',
        channel: 'PREVIEW',
        botId: null,
        chatId: startAck.chatId,
        userId: `author:${authorId}`,
      },
      expect.stringMatching(jobIdPattern),
    ]);
    expect(calls[1]).toEqual([
      {
        type: 'TEXT_MESSAGE',
        channel: 'PREVIEW',
        botId: null,
        chatId: startAck.chatId,
        userId: `author:${authorId}`,
        payload: 'Привет',
      },
      expect.stringMatching(jobIdPattern),
    ]);
    expect(calls[2]).toEqual([
      {
        type: 'BUTTON_PRESS',
        channel: 'PREVIEW',
        botId: null,
        chatId: startAck.chatId,
        userId: `author:${authorId}`,
        payload: 'block-question-1:2',
        sourceBlockId: 'block-question-1',
      },
      expect.stringMatching(jobIdPattern),
    ]);
    expect(calls[3]).toEqual([
      {
        type: 'START_COMMAND',
        channel: 'PREVIEW',
        botId: null,
        chatId: startAck.chatId,
        userId: `author:${authorId}`,
      },
      expect.stringMatching(jobIdPattern),
    ]);
    expect(new Set(calls.map(([, jobId]) => jobId)).size).toBe(4);
  });

  it('два сокета подряд с тем же sessionId ставят в очередь Redis оба задания START_COMMAND', async () => {
    const owner = await registerAuthorWithProject('dedup@example.com');
    const existingSessionId = '33333333-3333-4333-8333-333333333333';
    const expectedChatId = `preview:${owner.projectId}:${existingSessionId}`;

    await db.prisma.dialogContext.create({
      data: {
        botId: null,
        chatId: expectedChatId,
        userId: `author:${owner.authorId}`,
        channel: 'PREVIEW',
        state: 'WAITING_USER',
        variables: {},
      },
    });

    const socket1 = await openClient(owner.cookieHeader);
    const ack1 = await emitAck<StartAck>(socket1, 'start', {
      projectId: owner.projectId,
      sessionId: existingSessionId,
    });
    expect(ack1).toEqual({ chatId: expectedChatId });
    socket1.disconnect();

    const socket2 = await openClient(owner.cookieHeader);
    const ack2 = await emitAck<StartAck>(socket2, 'start', {
      projectId: owner.projectId,
      sessionId: existingSessionId,
    });
    expect(ack2).toEqual({ chatId: expectedChatId });

    // Проверяем реальную очередь BullMQ в Redis, а не spy на enqueue
    const prefix = process.env.QUEUE_PREFIX!;
    const partition = partitionOf(dialogKey(null, expectedChatId));
    const qKey = `${prefix}:${queueName(partition)}`;
    const queuedJobIds = await redisPub.lrange(`${qKey}:wait`, 0, -1);

    const matchingEvents: ChatEvent[] = [];
    for (const id of queuedJobIds) {
      const rawData = await redisPub.hget(`${qKey}:${id}`, 'data');
      if (!rawData) continue;
      const event = JSON.parse(rawData) as ChatEvent;
      if (event.chatId === expectedChatId && event.type === 'START_COMMAND') {
        matchingEvents.push(event);
      }
    }
    expect(matchingEvents).toHaveLength(2);
  });

  it('возвращает ack с ошибкой, если постановка события в очередь падает', async () => {
    const owner = await registerAuthorWithProject('queue-fail@example.com');
    const socket = await openClient(owner.cookieHeader);

    enqueueSpy.mockRejectedValueOnce(new Error('Redis недоступен'));
    const startAck = await emitAck<StartAck>(socket, 'start', { projectId: owner.projectId });
    expect(startAck).toEqual({ error: 'Не удалось отправить событие' });

    const okStart = await emitAck<StartAck>(socket, 'start', { projectId: owner.projectId });
    expect(okStart.chatId).toBeDefined();

    enqueueSpy.mockRejectedValueOnce(new Error('Redis недоступен'));
    const inputAck = await emitAck<ActionAck>(socket, 'input', { text: 'привет' });
    expect(inputAck).toEqual({ error: 'Не удалось отправить событие' });

    enqueueSpy.mockRejectedValueOnce(new Error('Redis недоступен'));
    const buttonAck = await emitAck<ActionAck>(socket, 'button', { callbackData: 'blk:0' });
    expect(buttonAck).toEqual({ error: 'Не удалось отправить событие' });

    enqueueSpy.mockRejectedValueOnce(new Error('Redis недоступен'));
    const restartAck = await emitAck<ActionAck>(socket, 'restart');
    expect(restartAck).toEqual({ error: 'Не удалось отправить событие' });
  });

  it('отклоняет input длиннее 4096 символов и button длиннее 64 символов', async () => {
    const owner = await registerAuthorWithProject('limits@example.com');
    const socket = await openClient(owner.cookieHeader);
    const startAck = await emitAck<StartAck>(socket, 'start', { projectId: owner.projectId });
    expect(startAck.chatId).toBeDefined();
    enqueueSpy.mockClear();

    const tooLongText = await emitAck<ActionAck>(socket, 'input', { text: 'а'.repeat(4097) });
    expect(tooLongText.error).toBeTruthy();

    const tooLongButton = await emitAck<ActionAck>(socket, 'button', {
      callbackData: `${'b'.repeat(63)}:1`,
    });
    expect(tooLongButton.error).toBeTruthy();
    expect(enqueueSpy).not.toHaveBeenCalled();

    const maxText = await emitAck<ActionAck>(socket, 'input', { text: 'а'.repeat(4096) });
    expect(maxText).toEqual({ ok: true });

    const maxButton = await emitAck<ActionAck>(socket, 'button', {
      callbackData: `${'b'.repeat(62)}:1`,
    });
    expect(maxButton).toEqual({ ok: true });
    expect(enqueueSpy).toHaveBeenCalledTimes(2);
  });

  it('отклоняет рукопожатие с чужим заголовком Origin и пропускает same-origin', async () => {
    const owner = await registerAuthorWithProject('origin@example.com');

    await expect(
      connectPreview(port, owner.cookieHeader, { origin: 'http://evil.example' }),
    ).rejects.toThrow();

    const allowed = await connectPreview(port, owner.cookieHeader, {
      origin: `http://127.0.0.1:${port}`,
    });
    openSockets.push(allowed);
    const ack = await emitAck<StartAck>(allowed, 'start', { projectId: owner.projectId });
    expect(ack.chatId).toBeDefined();
  });

  it('start с существующим sessionId проекта переиспользует chatId, а чужой sessionId заменяет новым', async () => {
    const owner = await registerAuthorWithProject('reuse@example.com');
    const existingSessionId = '11111111-1111-4111-8111-111111111111';
    const expectedChatId = `preview:${owner.projectId}:${existingSessionId}`;

    await db.prisma.dialogContext.create({
      data: {
        botId: null,
        chatId: expectedChatId,
        userId: `author:${owner.authorId}`,
        channel: 'PREVIEW',
        state: 'WAITING_USER',
        variables: {},
      },
    });

    const socket = await openClient(owner.cookieHeader);
    const reused = await emitAck<StartAck>(socket, 'start', {
      projectId: owner.projectId,
      sessionId: existingSessionId,
    });
    expect(reused).toEqual({ chatId: expectedChatId });

    const unknown = await emitAck<StartAck>(socket, 'start', {
      projectId: owner.projectId,
      sessionId: '22222222-2222-4222-8222-222222222222',
    });
    expect(unknown.chatId).toBeDefined();
    expect(unknown.chatId).not.toBe(`preview:${owner.projectId}:22222222-2222-4222-8222-222222222222`);

    // Существующий sessionId другого проекта того же автора не переиспользуется
    const agent = request.agent(app.getHttpServer());
    const secondProject = await agent
      .post('/api/projects')
      .set('Cookie', owner.cookieHeader)
      .send({ name: 'Второй проект' })
      .expect(201);
    const otherProjectSessionId = '44444444-4444-4444-8444-444444444444';
    await db.prisma.dialogContext.create({
      data: {
        botId: null,
        chatId: `preview:${secondProject.body.id}:${otherProjectSessionId}`,
        userId: `author:${owner.authorId}`,
        channel: 'PREVIEW',
        state: 'WAITING_USER',
        variables: {},
      },
    });
    const fromOtherProject = await emitAck<StartAck>(socket, 'start', {
      projectId: owner.projectId,
      sessionId: otherProjectSessionId,
    });
    expect(fromOtherProject.chatId).toBeDefined();
    expect(fromOtherProject.chatId).not.toBe(`preview:${owner.projectId}:${otherProjectSessionId}`);

    // Существующий sessionId другого автора не переиспользуется
    const otherAuthor = await registerAuthorWithProject('other-reuse@example.com');
    const otherAuthorSessionId = '55555555-5555-4555-8555-555555555555';
    await db.prisma.dialogContext.create({
      data: {
        botId: null,
        chatId: `preview:${owner.projectId}:${otherAuthorSessionId}`,
        userId: `author:${otherAuthor.authorId}`,
        channel: 'PREVIEW',
        state: 'WAITING_USER',
        variables: {},
      },
    });
    const fromOtherAuthor = await emitAck<StartAck>(socket, 'start', {
      projectId: owner.projectId,
      sessionId: otherAuthorSessionId,
    });
    expect(fromOtherAuthor.chatId).toBeDefined();
    expect(fromOtherAuthor.chatId).not.toBe(`preview:${owner.projectId}:${otherAuthorSessionId}`);
  });

  it('события PreviewEvent из Redis доставляются только в комнату своего сеанса', async () => {
    const owner = await registerAuthorWithProject('pubsub@example.com');
    const socket1 = await openClient(owner.cookieHeader);
    const socket2 = await openClient(owner.cookieHeader);

    const ack1 = await emitAck<StartAck>(socket1, 'start', { projectId: owner.projectId });
    const ack2 = await emitAck<StartAck>(socket2, 'start', { projectId: owner.projectId });
    expect(ack1.chatId).toBeDefined();
    expect(ack2.chatId).toBeDefined();
    expect(ack1.chatId).not.toBe(ack2.chatId);

    const receivedOn2: PreviewEvent[] = [];
    socket2.on('preview', (ev: PreviewEvent) => receivedOn2.push(ev));

    const eventFor1: PreviewEvent = {
      type: 'message',
      message: { kind: 'text', text: 'Только для первого окна' },
    };
    const nextOn1 = waitPreviewEvent(socket1);

    // Некорректный JSON не должен ломать подписчика
    await redisPub.publish(`preview:${ack1.chatId}`, '{broken-json');
    await redisPub.publish(`preview:${ack1.chatId}`, JSON.stringify(eventFor1));

    expect(await nextOn1).toEqual(eventFor1);

    // Повторный start на socket1 выводит его из старой комнаты
    const ack1New = await emitAck<StartAck>(socket1, 'start', { projectId: owner.projectId });
    expect(ack1New.chatId).not.toBe(ack1.chatId);

    const receivedOn1AfterRejoin: PreviewEvent[] = [];
    socket1.on('preview', (ev: PreviewEvent) => receivedOn1AfterRejoin.push(ev));

    const systemEvent: PreviewEvent = {
      type: 'system',
      text: 'Старое событие',
      blockId: 'b1',
    };
    await redisPub.publish(`preview:${ack1.chatId}`, JSON.stringify(systemEvent));

    const newRoomEvent: PreviewEvent = {
      type: 'currentBlock',
      blockId: 'b2',
    };
    const nextOn1New = waitPreviewEvent(socket1);
    await redisPub.publish(`preview:${ack1New.chatId}`, JSON.stringify(newRoomEvent));

    expect(await nextOn1New).toEqual(newRoomEvent);
    expect(receivedOn1AfterRejoin).toEqual([newRoomEvent]);
    expect(receivedOn2).toEqual([]);
  });
});
