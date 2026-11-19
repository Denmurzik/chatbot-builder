import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, textEvent, waitFor, type TestEnv } from '../testing/test-env';
import { QueueHttpResultSink } from './queue-http-result-sink';

describe('QueueHttpResultSink', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 120000);

  afterAll(async () => {
    await env?.close();
  });

  async function createRequest() {
    const bot = await env.createBot();
    await env.emit(textEvent(bot.id, 'tg:7', 'старт'));
    await waitFor(() => env.texts(bot.id, 'tg:7').length >= 1);
    const ctx = await env.db.dialogContext.findFirstOrThrow({ where: { botId: bot.id } });
    return env.db.httpRequest.create({
      data: {
        dialogContextId: ctx.id,
        blockId: 'req',
        method: 'GET',
        url: 'http://x',
        headers: [],
        body: '',
        status: 'SENT',
      },
    });
  }

  it('успешный ответ обновляет http_request и ставит событие в очередь диалога', async () => {
    const request = await createRequest();
    const sink = env.module.get(QueueHttpResultSink);
    await sink.onResponse(request.id, 200, '{"ok":true}');

    const row = await env.db.httpRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(row).toMatchObject({
      status: 'SUCCEEDED',
      responseCode: 200,
      responseBody: '{"ok":true}',
    });
  });

  it('тайм-аут (код 0) даёт статус TIMED_OUT, ошибка статуса — FAILED', async () => {
    const sink = env.module.get(QueueHttpResultSink);
    const timedOut = await createRequest();
    await sink.onFailure(timedOut.id, 0, 'Превышено время ожидания ответа (5 с)');
    const failed = await createRequest();
    await sink.onFailure(failed.id, 500, 'Внешняя система ответила кодом 500');

    const a = await env.db.httpRequest.findUniqueOrThrow({ where: { id: timedOut.id } });
    const b = await env.db.httpRequest.findUniqueOrThrow({ where: { id: failed.id } });
    expect(a).toMatchObject({ status: 'TIMED_OUT', responseCode: null });
    expect(b).toMatchObject({ status: 'FAILED', responseCode: 500 });
  });
});
