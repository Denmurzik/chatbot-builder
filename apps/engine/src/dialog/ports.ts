import type { MessengerType } from '@chatbot/db';
import type { OutgoingMessage, PendingHttpRequest } from '@chatbot/engine-core';
import { NotImplementedError } from '@chatbot/model';

/** Исходящий HTTP-запрос блока «HTTP-запрос». */
export interface OutgoingHttpRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

// Порт запуска исходящего HTTP-запроса после фиксации транзакции (реализуется в HttpModule)
export abstract class HttpRequestLauncher {
  abstract launch(request: OutgoingHttpRequest, pending: PendingHttpRequest): void;
}

// Порт отправки сообщений пользователю (реализуется в MessengerModule; в тестах заменяется подделкой)
export abstract class MessengerGateway {
  abstract sendMessage(botId: string, chatId: string, message: OutgoingMessage): Promise<void>;

  // Пачка сообщений одного события; при первой ошибке остальные не отправляются, чтобы не нарушить порядок
  async sendMessages(botId: string, chatId: string, messages: OutgoingMessage[]): Promise<void> {
    for (const message of messages) await this.sendMessage(botId, chatId, message);
  }

  // Отправка вопроса с кнопками вариантов (класс модели MessengerGateway, UC-U-08..U-11, спринт 2)
  sendQuestion(
    _botId: string,
    _chatId: string,
    _question: string,
    _buttons: string[],
  ): Promise<void> {
    throw new NotImplementedError('MessengerGateway.sendQuestion');
  }

  // Проверка валидности токена мессенджера (UC-A-25, спринт 2)
  verifyToken(_messenger: MessengerType, _token: string): Promise<boolean> {
    throw new NotImplementedError('MessengerGateway.verifyToken');
  }

  // Подключение бота к мессенджеру (setWebhook, UC-A-26, SD-6, спринт 3)
  connectBot(_botId: string, _messenger: MessengerType, _token: string): Promise<void> {
    throw new NotImplementedError('MessengerGateway.connectBot');
  }

  // Отключение бота от мессенджера (deleteWebhook, UC-A-25, спринт 3)
  disconnectBot(_messenger: MessengerType, _token: string): Promise<void> {
    throw new NotImplementedError('MessengerGateway.disconnectBot');
  }
}
