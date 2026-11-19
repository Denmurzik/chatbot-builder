import type { PrismaClient } from '@chatbot/db';
import type { ChatEvent } from '@chatbot/model';
import type { EventQueue } from '@chatbot/queue';
import type { HttpResultSink } from './external-api-client';

// Приёмник результата HTTP-запроса: обновляет http_request и ставит событие в очередь диалога,
// чтобы ответ обрабатывался в том же порядке, что и остальные события (п. 2.2)
export class QueueHttpResultSink implements HttpResultSink {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: EventQueue,
  ) {}

  async onResponse(requestId: string, status: number, body: string): Promise<void> {
    await this.finish(requestId, 'RESPONSE_RECEIVED', {
      status: 'SUCCEEDED',
      responseCode: status,
      responseBody: body,
    });
  }

  async onFailure(requestId: string, code: number, message: string): Promise<void> {
    await this.finish(requestId, 'REQUEST_FAILED', {
      status: code === 0 ? 'TIMED_OUT' : 'FAILED',
      responseCode: code === 0 ? null : code,
      error: message,
    });
  }

  private async finish(
    requestId: string,
    type: ChatEvent['type'],
    data: Record<string, unknown>,
  ): Promise<void> {
    const request = await this.prisma.httpRequest.update({
      where: { id: requestId },
      data,
      include: { dialogContext: true },
    });
    const context = request.dialogContext;
    await this.queue.enqueue(
      {
        type,
        channel: context.channel,
        botId: context.botId,
        chatId: context.chatId,
        userId: context.userId,
        requestId,
      },
      `http-${requestId}-${type}`,
    );
  }
}
