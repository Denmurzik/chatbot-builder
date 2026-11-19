import path from 'node:path';
import dotenv from 'dotenv';
import type { AppConfig } from './infra/tokens';

// Загружаем корневой .env при импорте модуля, независимо от cwd и порядка провайдеров
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Собирает конфигурацию engine из переменных окружения
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  const redisUrl = env.REDIS_URL?.trim();
  if (!databaseUrl) throw new Error('Не задана переменная окружения DATABASE_URL');
  if (!redisUrl) throw new Error('Не задана переменная окружения REDIS_URL');
  const queuePrefix = env.QUEUE_PREFIX?.trim() || undefined;
  return { databaseUrl, redisUrl, ...(queuePrefix ? { queuePrefix } : {}) };
}
