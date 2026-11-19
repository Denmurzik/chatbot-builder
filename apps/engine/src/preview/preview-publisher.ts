import { NotImplementedError } from '@chatbot/model';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../infra/tokens';

/**
 * Публикатор событий канала PREVIEW в Redis (сообщение, текущий блок, переменные, системное сообщение).
 * Реализует UC-A-20…A-23 (сторона движка); реализация запланирована на спринт 2.
 */
@Injectable()
export class PreviewPublisher {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  publishMessage(_chatId: string, _text: string, _buttons?: string[]): Promise<void> {
    void this.config;
    throw new NotImplementedError('PreviewPublisher.publishMessage');
  }

  publishCurrentBlock(_chatId: string, _blockId: string): Promise<void> {
    throw new NotImplementedError('PreviewPublisher.publishCurrentBlock');
  }

  publishVariables(_chatId: string, _variables: Record<string, string>): Promise<void> {
    throw new NotImplementedError('PreviewPublisher.publishVariables');
  }

  publishSystemMessage(_chatId: string, _text: string): Promise<void> {
    throw new NotImplementedError('PreviewPublisher.publishSystemMessage');
  }
}
