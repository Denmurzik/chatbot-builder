import { Global, Module } from '@nestjs/common';
import dotenv from 'dotenv';

// Загружаем .env без перезаписи уже установленных переменных окружения (важно для тестов)
dotenv.config();

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export const API_CONFIG = Symbol('API_CONFIG');

export interface ApiConfig {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  telegramPolling: boolean;
}

// Читает и проверяет конфигурацию API из переменных окружения
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('Не задана переменная окружения DATABASE_URL');
  }

  const jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    throw new Error('Не задана переменная окружения JWT_SECRET');
  }

  const rawPort = env.API_PORT?.trim();
  const port = rawPort ? Number(rawPort) : 3000;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Некорректный порт API_PORT: "${rawPort}"`);
  }

  const nodeEnv = env.NODE_ENV?.trim() || 'development';

  return {
    databaseUrl,
    jwtSecret,
    port,
    nodeEnv,
    isProduction: nodeEnv === 'production',
    telegramPolling: env.TELEGRAM_POLLING !== '0',
  };
}

// Глобальный модуль конфигурации, предоставляющий ApiConfig через DI
@Global()
@Module({
  providers: [
    {
      provide: API_CONFIG,
      useFactory: () => loadConfig(),
    },
  ],
  exports: [API_CONFIG],
})
export class ConfigModule {}
