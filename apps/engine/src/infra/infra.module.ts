import { createPrismaClient, type PrismaClient } from '@chatbot/db';
import { DialogEngine } from '@chatbot/engine-core';
import { EventQueue } from '@chatbot/queue';
import { SecretVault } from '@chatbot/vault';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { loadConfig } from '../config';
import { APP_CONFIG, EVENT_QUEUE, PRISMA, type AppConfig } from './tokens';

// Общие провайдеры: конфигурация, клиент Prisma, SecretVault и движок диалогов
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: loadConfig },
    {
      provide: PRISMA,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createPrismaClient(config.databaseUrl),
    },
    {
      provide: EVENT_QUEUE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new EventQueue(config.redisUrl, config.queuePrefix ? { prefix: config.queuePrefix } : {}),
    },
    { provide: SecretVault, useFactory: () => SecretVault.fromEnv() },
    { provide: DialogEngine, useFactory: () => new DialogEngine() },
  ],
  exports: [APP_CONFIG, PRISMA, EVENT_QUEUE, SecretVault, DialogEngine],
})
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(EVENT_QUEUE) private readonly queue: EventQueue,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    await this.prisma.$disconnect();
  }
}
