import { EventQueue } from '@chatbot/queue';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';

export const EVENT_QUEUE = Symbol('EVENT_QUEUE');

// Глобальный модуль очереди событий (производитель; потребляет её engine)
@Global()
@Module({
  providers: [
    {
      provide: EVENT_QUEUE,
      useFactory: (): EventQueue => {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) throw new Error('Не задана переменная окружения REDIS_URL');
        const prefix = process.env.QUEUE_PREFIX?.trim();
        return new EventQueue(redisUrl, prefix ? { prefix } : {});
      },
    },
  ],
  exports: [EVENT_QUEUE],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(EVENT_QUEUE) private readonly queue: EventQueue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
