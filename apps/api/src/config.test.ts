import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  const baseEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: 'postgresql://chatbot:chatbot@127.0.0.1:55432/chatbot',
    JWT_SECRET: 'change-me-dev-jwt-secret',
    NODE_ENV: 'development',
  };

  it('разрешает dev-секрет вне production', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.isProduction).toBe(false);
    expect(cfg.jwtSecret).toBe('change-me-dev-jwt-secret');
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
});
