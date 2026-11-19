import { Injectable, Logger } from '@nestjs/common';
import { HttpRequestLauncher, type OutgoingHttpRequest } from '../dialog/ports';

// Заглушка спринта 1 для порта HttpRequestLauncher (реальная отправка — HttpRequestExecutor в спринте 2)
@Injectable()
export class NoopHttpRequestLauncher extends HttpRequestLauncher {
  private readonly logger = new Logger(NoopHttpRequestLauncher.name);

  launch(request: OutgoingHttpRequest): void {
    this.logger.debug(`HTTP-запрос ${request.id} сохранён, отправка появится в спринте 2`);
  }
}
