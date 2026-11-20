import { Injectable } from '@nestjs/common';
import { Api } from 'grammy';

// Подмножество Bot API, которое нужно серверу; в тестах подменяется фабрикой-заглушкой
export interface TelegramApi {
  setWebhook(
    url: string,
    other?: { secret_token?: string; allowed_updates?: Array<'message' | 'callback_query'> },
  ): Promise<unknown>;
  deleteWebhook(): Promise<unknown>;
  getMe(): Promise<{ username?: string }>;
  answerCallbackQuery(callbackQueryId: string): Promise<unknown>;
}

const REQUEST_TIMEOUT_SECONDS = 10;

// Создаёт клиент Bot API для токена (без сети до первого вызова)
@Injectable()
export class TelegramApiFactory {
  create(token: string): TelegramApi {
    return new Api(token, { timeoutSeconds: REQUEST_TIMEOUT_SECONDS });
  }
}
