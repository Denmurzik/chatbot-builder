import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  const baseEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: 'postgresql://chatbot:chatbot@127.0.0.1:55432/chatbot',
    JWT_SECRET: 'change-me-dev-jwt-secret',
    NODE_ENV: 'development',
  };

  it('разрешает dev-секрет вне production и отключает telegramPolling по умолчанию', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.isProduction).toBe(false);
    expect(cfg.jwtSecret).toBe('change-me-dev-jwt-secret');
    expect(cfg.telegramPolling).toBe(false);
  });

  it('включает telegramPolling только при TELEGRAM_POLLING=1 вне production', () => {
    expect(loadConfig({ ...baseEnv, TELEGRAM_POLLING: '1' }).telegramPolling).toBe(true);
    expect(loadConfig({ ...baseEnv, TELEGRAM_POLLING: '0' }).telegramPolling).toBe(false);
    expect(loadConfig({ ...baseEnv, TELEGRAM_POLLING: 'true' }).telegramPolling).toBe(false);
  });

  it('отключает telegramPolling в production с предупреждением даже при TELEGRAM_POLLING=1', () => {
    const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    try {
      const cfg = loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'a-very-strong-production-jwt-secret-key-32-plus-chars',
        TELEGRAM_POLLING: '1',
      });
      expect(cfg.telegramPolling).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('TELEGRAM_POLLING'),
        'Config',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('отклоняет короткий или дефолтный JWT_SECRET в production', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'change-me-dev-jwt-secret',
      }),
    ).toThrow(/JWT_SECRET/);

    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'short-secret-under-32-chars',
      }),
    ).toThrow(/JWT_SECRET/);

    const validProd = loadConfig({
      ...baseEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'a-very-strong-production-jwt-secret-key-32-plus-chars',
    });
    expect(validProd.isProduction).toBe(true);
  });

  it('читает QUEUE_PREFIX при наличии и обрезает пробелы', () => {
    expect(loadConfig(baseEnv).queuePrefix).toBeUndefined();
    expect(loadConfig({ ...baseEnv, QUEUE_PREFIX: '  test-prefix  ' }).queuePrefix).toBe(
      'test-prefix',
    );
    expect(loadConfig({ ...baseEnv, QUEUE_PREFIX: '   ' }).queuePrefix).toBeUndefined();
  });
});
