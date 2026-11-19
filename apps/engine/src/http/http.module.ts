import type { PrismaClient } from '@chatbot/db';
import type { EventQueue } from '@chatbot/queue';
import { Module } from '@nestjs/common';
import { EVENT_QUEUE, PRISMA } from '../infra/tokens';
import { ExternalApiClient } from './external-api-client';
import { HttpRequestLauncher, NoopHttpRequestLauncher } from './http-request-launcher';
import { QueueHttpResultSink } from './queue-http-result-sink';

@Module({
  providers: [
    {
      provide: QueueHttpResultSink,
      inject: [PRISMA, EVENT_QUEUE],
      useFactory: (prisma: PrismaClient, queue: EventQueue) =>
        new QueueHttpResultSink(prisma, queue),
    },
    {
      provide: ExternalApiClient,
      inject: [QueueHttpResultSink],
      useFactory: (sink: QueueHttpResultSink) => new ExternalApiClient(sink),
    },
    { provide: HttpRequestLauncher, useClass: NoopHttpRequestLauncher },
  ],
  exports: [ExternalApiClient, QueueHttpResultSink, HttpRequestLauncher],
})
export class HttpModule {}
