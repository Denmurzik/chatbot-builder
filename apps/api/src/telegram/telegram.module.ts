import { Module } from '@nestjs/common';
import { MessengerGatewayController } from './messenger-gateway.controller';
import { PollingService } from './polling.service';
import { UpdateIngestService } from './update-ingest.service';

// Приём обновлений Telegram: webhook и dev long polling -> очередь событий
@Module({
  controllers: [MessengerGatewayController],
  providers: [UpdateIngestService, PollingService],
})
export class TelegramModule {}
