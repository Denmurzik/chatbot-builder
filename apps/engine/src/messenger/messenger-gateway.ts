import type { PrismaClient } from '@chatbot/db';
import type { OutgoingMessage } from '@chatbot/engine-core';
import { SecretVault } from '@chatbot/vault';
import { Inject, Injectable } from '@nestjs/common';
import { Api } from 'grammy';
import { PRISMA } from '../infra/tokens';
import { parseTelegramChatId, toInlineKeyboard } from './telegram-format';

// Шлюз отправки сообщений пользователю; в тестах заменяется подделкой
export abstract class MessengerGateway {
  abstract sendMessage(botId: string, chatId: string, message: OutgoingMessage): Promise<void>;
}

// Реализация для Telegram: токен берётся из messenger_connection и расшифровывается в памяти
@Injectable()
export class TelegramMessengerGateway extends MessengerGateway {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly vault: SecretVault,
  ) {
    super();
  }

  async sendMessage(botId: string, chatId: string, message: OutgoingMessage): Promise<void> {
    const connection = await this.prisma.messengerConnection.findUnique({
      where: { botId_messenger: { botId, messenger: 'TELEGRAM' } },
    });
    if (!connection) throw new Error(`У бота ${botId} нет подключения к Telegram`);
    const token = this.vault.decrypt(
      { cipherText: connection.tokenCipher, mask: connection.tokenMask },
      `${botId}:TELEGRAM`,
    );
    const api = new Api(token);
    const telegramChatId = parseTelegramChatId(chatId);
    if (message.kind === 'question' && message.buttons.length > 0) {
      await api.sendMessage(telegramChatId, message.text, {
        reply_markup: { inline_keyboard: toInlineKeyboard(message.buttons) },
      });
    } else {
      await api.sendMessage(telegramChatId, message.text);
    }
  }
}
