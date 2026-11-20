import type { OutgoingMessageLike, PreviewEvent } from '@chatbot/model';
import { createRedisConnection } from '@chatbot/queue';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type IORedis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../infra/tokens';

/**
 * Публикатор событий канала PREVIEW в Redis pub/sub (`preview:<chatId>`):
 * сообщения бота, подсветка текущего блока, переменные и системные сообщения (UC-A-20…A-23).
 */
@Injectable()
export class PreviewPublisher implements OnApplicationShutdown {
  private redis: IORedis | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async publishMessage(chatId: string, message: OutgoingMessageLike): Promise<void> {
    await this.publish(chatId, { type: 'message', message });
  }

  async publishCurrentBlock(chatId: string, blockId: string | null): Promise<void> {
    await this.publish(chatId, { type: 'currentBlock', blockId });
  }

  async publishVariables(chatId: string, variables: Record<string, string>): Promise<void> {
    await this.publish(chatId, { type: 'variables', variables });
  }

  async publishSystemMessage(
    chatId: string,
    text: string,
    blockId: string | null = null,
  ): Promise<void> {
    await this.publish(chatId, { type: 'system', text, blockId });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis) {
      const client = this.redis;
      this.redis = null;
      await client.quit();
    }
  }

  private async publish(chatId: string, event: PreviewEvent): Promise<void> {
    const client = this.getClient();
    await client.publish(`preview:${chatId}`, JSON.stringify(event));
  }

  private getClient(): IORedis {
    if (!this.redis) {
      this.redis = createRedisConnection(this.config.redisUrl);
    }
    return this.redis;
  }
}
