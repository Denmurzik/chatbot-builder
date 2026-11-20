// Токены внедрения зависимостей и конфигурация приложения engine
export const APP_CONFIG = Symbol('APP_CONFIG');
export const PRISMA = Symbol('PRISMA');
export const EVENT_QUEUE = Symbol('EVENT_QUEUE');

export interface AppConfig {
  databaseUrl: string;
  redisUrl: string;
  // Префикс ключей BullMQ (в тестах — уникальный)
  queuePrefix?: string;
  // URL HTTP-прокси для исходящих запросов к Telegram Bot API
  telegramProxy?: string;
}
