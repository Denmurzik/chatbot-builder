import type { EventQueue } from '@chatbot/queue';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { EVENT_QUEUE } from '../queue/queue.module';
import { mapUpdate, type TelegramUpdate } from './update-mapper';

// Общий путь приёма обновлений (webhook и long polling): проверка публикации -> mapUpdate -> очередь
@Injectable()
export class UpdateIngestService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_QUEUE) private readonly queue: EventQueue,
  ) {}

  // Возвращает true, если задание поставлено в очередь
  async ingest(botId: string, update: TelegramUpdate): Promise<boolean> {
    const bot = await this.prisma.client.bot.findUnique({
      where: { id: botId },
      select: { status: true },
    });
    if (bot?.status !== 'PUBLISHED') return false;
    const mapped = mapUpdate(botId, update);
    if (!mapped) return false;
    await this.queue.enqueue(mapped.event, mapped.jobId);
    return true;
  }
}
