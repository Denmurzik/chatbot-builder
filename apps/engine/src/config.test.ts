import { describe, expect, it } from 'vitest';
import { loadAllowedHosts, loadConfig } from './config';

describe('loadConfig (engine)', () => {
  const baseEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: 'postgresql://chatbot:chatbot@127.0.0.1:55432/chatbot',
    REDIS_URL: 'redis://127.0.0.1:56379',
  };

  it('читает DATABASE_URL, REDIS_URL и опциональный QUEUE_PREFIX', () => {
    expect(loadConfig(baseEnv)).toEqual({
      databaseUrl: baseEnv.DATABASE_URL,
      redisUrl: baseEnv.REDIS_URL,
    });
    expect(loadConfig({ ...baseEnv, QUEUE_PREFIX: '  eng-prefix  ' }).queuePrefix).toBe(
      'eng-prefix',
    );
    expect(loadConfig({ ...baseEnv, QUEUE_PREFIX: '   ' }).queuePrefix).toBeUndefined();
  });
});

describe('loadAllowedHosts', () => {
  it('не задано или пусто — null (без ограничений)', () => {
    expect(loadAllowedHosts({})).toBeNull();
    expect(loadAllowedHosts({ HTTP_ALLOWED_HOSTS: ' , ' })).toBeNull();
  });

  it('разбирает список через запятую в нижнем регистре', () => {
    expect(loadAllowedHosts({ HTTP_ALLOWED_HOSTS: 'Mock-Clinic, api.example.com ' })).toEqual([
      'mock-clinic',
      'api.example.com',
    ]);
  });
});
