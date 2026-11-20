import { Global, Module } from '@nestjs/common';
import { PreviewPublisher } from './preview-publisher';

// Модуль публикации событий канала превью в Redis (UC-A-20…A-23, спринт 2)
@Global()
@Module({
  providers: [PreviewPublisher],
  exports: [PreviewPublisher],
})
export class PreviewModule {}
