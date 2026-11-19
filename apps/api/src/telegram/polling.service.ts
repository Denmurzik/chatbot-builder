import { SecretVault } from '@chatbot/vault';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Bot } from 'grammy';
import { API_CONFIG, type ApiConfig } from '../config';
import { PrismaService } from '../prisma/prisma.module';
import { UpdateIngestService } from './update-ingest.service';

// Возвращает только имя типа ошибки, чтобы не утекли URL/токены из сообщения
function errorName(err: unknown): string {
  return err instanceof Error ? err.name : 'UnknownError';
}

// Dev-режим: long polling вместо webhook для опубликованных ботов (TELEGRAM_POLLING=1)
@Injectable()
export class PollingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PollingService.name);
  private readonly bots: Bot[] = [];

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly prisma: PrismaService,
    private readonly ingestService: UpdateIngestService,
    private readonly vault: SecretVault,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.telegramPolling) return;
    const connections = await this.prisma.client.messengerConnection.findMany({
      where: { messenger: 'TELEGRAM', bot: { status: 'PUBLISHED' } },
    });
    for (const connection of connections) {
      const botId = connection.botId;
      try {
        const token = this.vault.decrypt(
          { cipherText: connection.tokenCipher, mask: connection.tokenMask },
          `${botId}:TELEGRAM`,
        );
        const bot = new Bot(token);
        bot.use(async (ctx) => {
          try {
            await this.ingestService.ingest(botId, ctx.update);
          } catch (err) {
            this.logger.error(`Ошибка приёма обновления бота ${botId}: ${errorName(err)}`);
          }
        });
        this.bots.push(bot);
        // Запускаем polling в фоне без блокировки старта API; bot.start() сам снимает webhook
        void bot.start().catch((err: unknown) => {
          this.logger.error(`Polling бота ${botId} остановлен: ${errorName(err)}`);
        });
        this.logger.log(`Long polling запущен для бота ${botId}`);
      } catch (err) {
        // Сообщение ошибки может содержать URL с токеном — логируем только тип
        this.logger.error(`Не удалось запустить polling бота ${botId}: ${errorName(err)}`);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.bots.map((bot) => bot.stop().catch(() => undefined)));
  }
}
