import { chatEventSchema } from '@chatbot/model';
import { PARTITIONS, createRedisConnection, queueName, type EventQueue } from '@chatbot/queue';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { DialogService } from '../dialog/dialog.service';
import { APP_CONFIG, EVENT_QUEUE, type AppConfig } from '../infra/tokens';

// Диспетчер событий: по одному воркеру с concurrency = 1 на каждый из 16 разделов очереди (п. 2.2)
@Injectable()
export class EventDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventDispatcher.name);
  private connection: IORedis | null = null;
  private workers: Worker[] = [];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EVENT_QUEUE) private readonly queue: EventQueue,
    private readonly dialog: DialogService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Раздел не обрабатывают двое одновременно, даже при нескольких процессах engine
    await this.queue.setGlobalConcurrency(1);
    const connection = createRedisConnection(this.config.redisUrl);
    this.connection = connection;
    for (let partition = 0; partition < PARTITIONS; partition++) {
      const worker = new Worker(queueName(partition), (job) => this.handle(job), {
        connection,
        concurrency: 1,
        ...(this.config.queuePrefix ? { prefix: this.config.queuePrefix } : {}),
      });
      worker.on('error', (error) =>
        this.logger.error(`Ошибка воркера раздела ${partition}`, error),
      );
      this.workers.push(worker);
    }
    await Promise.all(this.workers.map((w) => w.waitUntilReady()));
  }

  // Ошибка задания пишется в журнал и не повторяется: повтор обогнал бы следующие события диалога
  private async handle(job: Job): Promise<void> {
    try {
      const event = chatEventSchema.parse(job.data);
      await this.dialog.process(event);
    } catch (error) {
      this.logger.error(`Задание ${job.id} завершилось ошибкой`, error);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    this.workers = [];
    await this.connection?.quit();
    this.connection = null;
  }
}
