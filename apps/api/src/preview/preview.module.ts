import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PreviewGateway } from './preview.gateway';
import { PreviewSubscriber } from './preview-subscriber';

// Модуль превью сценария: Socket.IO-шлюз и подписчик Redis pub/sub (UC-A-20…A-23)
@Module({
  imports: [AuthModule],
  providers: [PreviewSubscriber, PreviewGateway],
})
export class PreviewModule {}
