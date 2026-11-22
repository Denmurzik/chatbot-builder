import { Module } from '@nestjs/common';
import { MessengerAdminPort } from '../publication/messenger-admin.port';
import { MessengerGatewayController } from './messenger-gateway.controller';
import { PollingService } from './polling.service';
import { TelegramAdminAdapter } from './telegram-admin.adapter';
import { TelegramApiFactory } from './telegram-api.factory';
import { TelegramWebhookService } from './telegram-webhook.service';
import { UpdateIngestService } from './update-ingest.service';

// Приём обновлений Telegram: webhook и long polling -> очередь событий
@Module({
  controllers: [MessengerGatewayController],
  providers: [
    UpdateIngestService,
    PollingService,
    TelegramApiFactory,
    TelegramWebhookService,
    { provide: MessengerAdminPort, useClass: TelegramAdminAdapter },
  ],
  exports: [PollingService, TelegramWebhookService, TelegramApiFactory, MessengerAdminPort],
})
export class TelegramModule {}
