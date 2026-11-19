import { NotImplementedError } from '@chatbot/model';
import pRetry from 'p-retry';
import { request as undiciRequest, type Dispatcher } from 'undici';

/** Исходящий HTTP-запрос блока «HTTP-запрос». */
export interface OutgoingHttpRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Приёмник результата: вызывается один раз после всех попыток. */
export interface HttpResultSink {
  onResponse(requestId: string, status: number, body: string): Promise<void>;
  onFailure(requestId: string, code: number, message: string): Promise<void>;
}

/** Ошибка с кодом: HTTP-статус не 2xx или 0 для тайм-аута и сетевой ошибки. */
class HttpAttemptError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * HTTP-клиент с тайм-аутом и повторами (п. 2.6).
 * `send` не ждёт ответа: результат приходит в приёмник.
 */
export class ExternalApiClient {
  constructor(private readonly sink: HttpResultSink) {}

  send(request: OutgoingHttpRequest, timeoutSec: number, retryCount: number, retryIntervalSec: number): void {
    this.run(request, timeoutSec, retryCount, retryIntervalSec).catch((error: unknown) => {
      console.error('ExternalApiClient: необработанная ошибка', error);
    });
  }

  // Поиск отправленного запроса по идентификатору (класс модели ExternalApiClient, SD-3/SD-4, спринт 2)
  findSentRequest(_requestId: string): OutgoingHttpRequest | null {
    throw new NotImplementedError('ExternalApiClient.findSentRequest');
  }

  private async run(
    request: OutgoingHttpRequest,
    timeoutSec: number,
    retryCount: number,
    retryIntervalSec: number,
  ): Promise<void> {
    let result: { status: number; body: string };
    try {
      result = await pRetry(() => this.attempt(request, timeoutSec), {
        retries: retryCount,
        minTimeout: retryIntervalSec * 1000,
        maxTimeout: retryIntervalSec * 1000,
        factor: 1,
        randomize: false,
      });
    } catch (error) {
      const failure =
        error instanceof HttpAttemptError ? error : new HttpAttemptError(0, 'Не удалось выполнить запрос');
      await this.safely('onFailure', () => this.sink.onFailure(request.id, failure.code, failure.message));
      return;
    }
    await this.safely('onResponse', () => this.sink.onResponse(request.id, result.status, result.body));
  }

  /** Ошибка приёмника только логируется и не попадает в путь ошибок запроса. */
  private async safely(name: string, call: () => Promise<void>): Promise<void> {
    try {
      await call();
    } catch (error) {
      console.error(`ExternalApiClient: ошибка в приёмнике ${name}`, error);
    }
  }

  /** Одна попытка: 2xx — успех, всё остальное — ошибка для повтора. */
  private async attempt(
    request: OutgoingHttpRequest,
    timeoutSec: number,
  ): Promise<{ status: number; body: string }> {
    try {
      const response = await undiciRequest(request.url, {
        method: request.method as Dispatcher.HttpMethod,
        headers: request.headers,
        body: request.body ?? undefined,
        signal: AbortSignal.timeout(timeoutSec * 1000),
      });
      const body = await response.body.text();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new HttpAttemptError(response.statusCode, `Внешняя система ответила кодом ${response.statusCode}`);
      }
      return { status: response.statusCode, body };
    } catch (error) {
      if (error instanceof HttpAttemptError) throw error;
      const name = (error as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new HttpAttemptError(0, `Превышено время ожидания ответа (${timeoutSec} с)`);
      }
      throw new HttpAttemptError(0, `Сетевая ошибка: ${(error as Error).message}`);
    }
  }
}
