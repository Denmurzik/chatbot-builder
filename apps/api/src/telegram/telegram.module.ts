import { Module } from '@nestjs/common';
import { MessengerGatewayController } from './messenger-gateway.controller';
import { PollingService } from './polling.service';
import { TelegramApiFactory } from './telegram-api.factory';
import { TelegramWebhookService } from './telegram-webhook.service';
import { UpdateIngestService } from './update-ingest.service';

// Приём обновлений Telegram: webhook и dev long polling -> очередь событий
@Module({
  controllers: [MessengerGatewayController],
  providers: [UpdateIngestService, PollingService, TelegramApiFactory, TelegramWebhookService],
  exports: [PollingService, TelegramWebhookService],
})
export class TelegramModule {}
