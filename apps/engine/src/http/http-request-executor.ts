import type { HttpRequest, PrismaClient } from '@chatbot/db';
import { ExpressionEvaluator } from '@chatbot/engine-core';
import { NotImplementedError, type HttpRequestBlock } from '@chatbot/model';
import type { EventQueue } from '@chatbot/queue';
import { SecretVault } from '@chatbot/vault';
import { Inject, Injectable } from '@nestjs/common';
import { EVENT_QUEUE, PRISMA } from '../infra/tokens';
import { ExternalApiClient } from './external-api-client';
import { ResponseParser } from './response-parser';

/**
 * Класс модели BCE: HttpRequestExecutor — выполнение блока HTTP-запроса, разбор ответа,
 * стратегии ошибок и восстановление незавершённых запросов после перезапуска.
 * Реализует UC-U-14…U-20, SD-3, SD-4, SD-5; реализация запланирована на спринт 2.
 */
@Injectable()
export class HttpRequestExecutor {
  private readonly evaluator = new ExpressionEvaluator();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(EVENT_QUEUE) private readonly queue: EventQueue,
    private readonly apiClient: ExternalApiClient,
    private readonly responseParser: ResponseParser,
    private readonly vault: SecretVault,
  ) {}

  createAndSend(_block: HttpRequestBlock, _ctxId: string): HttpRequest {
    void this.prisma;
    void this.queue;
    void this.apiClient;
    void this.responseParser;
    void this.vault;
    void this.evaluator;
    throw new NotImplementedError('HttpRequestExecutor.createAndSend');
  }

  handleResponse(_ctxId: string): boolean {
    throw new NotImplementedError('HttpRequestExecutor.handleResponse');
  }

  handleFailure(_ctxId: string): void {
    throw new NotImplementedError('HttpRequestExecutor.handleFailure');
  }

  resend(_requestId: string): void {
    throw new NotImplementedError('HttpRequestExecutor.resend');
  }

  resume(_ctxId: string): void {
    throw new NotImplementedError('HttpRequestExecutor.resume');
  }

  // Восстановление диалогов с запросами в статусе SENT после перезапуска engine (п. 1.5, спринт 2)
  recoverAfterRestart(): Promise<void> {
    throw new NotImplementedError('HttpRequestExecutor.recoverAfterRestart');
  }
}
