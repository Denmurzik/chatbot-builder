import type { PendingHttpRequest } from '@chatbot/engine-core';
import { Injectable, Logger } from '@nestjs/common';
import type { OutgoingHttpRequest } from './external-api-client';

// Точка запуска HTTP-запроса после фиксации транзакции.
// В спринте 1 запрос только сохраняется; реальную отправку подключит HttpRequestExecutor в спринте 2.
export abstract class HttpRequestLauncher {
  abstract launch(request: OutgoingHttpRequest, pending: PendingHttpRequest): void;
}

@Injectable()
export class NoopHttpRequestLauncher extends HttpRequestLauncher {
  private readonly logger = new Logger(NoopHttpRequestLauncher.name);

  launch(request: OutgoingHttpRequest): void {
    this.logger.debug(`HTTP-запрос ${request.id} сохранён, отправка появится в спринте 2`);
  }
}
