import path from 'node:path';
import dotenv from 'dotenv';
import type { AppConfig } from './infra/tokens';

// Читает .env из корня репозитория (путь явный, не зависит от cwd) и собирает конфигурацию
export function loadConfig(): AppConfig {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl) throw new Error('Не задана переменная окружения DATABASE_URL');
  if (!redisUrl) throw new Error('Не задана переменная окружения REDIS_URL');
  return { databaseUrl, redisUrl };
}
