import { Module } from '@nestjs/common';
import { MessengerGateway, TelegramMessengerGateway } from './messenger-gateway';

@Module({
  providers: [{ provide: MessengerGateway, useClass: TelegramMessengerGateway }],
  exports: [MessengerGateway],
})
export class MessengerModule {}
