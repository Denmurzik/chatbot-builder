import { PARTITIONS, createRedisConnection, queueName } from '@chatbot/queue';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDIS_URL, createTestEnv, textEvent, waitFor, type TestEnv } from '../testing/test-env';

describe('EventDispatcher', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv();
  }, 120000);

  afterAll(async () => {
    await env?.close();
  });

  it('на каждом из 16 разделов глобальная конкурентность равна 1', async () => {
    const redis = createRedisConnection(REDIS_URL);
    try {
      for (let p = 0; p < PARTITIONS; p++) {
        const q = new Queue(queueName(p), { connection: redis, prefix: env.config.queuePrefix });
        expect(await q.getGlobalConcurrency()).toBe(1);
        await q.close();
      }
    } finally {
      await redis.quit();
    }
  });

  it('задание с неверным событием логируется и не повторяется, следующие идут дальше', async () => {
    const bot = await env.createBot();
    await env.emit({ ...textEvent(bot.id, 'tg:9', 'x'), type: 'NOPE' as never });
    await env.emit(textEvent(bot.id, 'tg:9', 'старт'));
    await waitFor(() => env.texts(bot.id, 'tg:9').length >= 1);
    expect(env.texts(bot.id, 'tg:9')).toEqual(['Что сказать?']);
  });
});
