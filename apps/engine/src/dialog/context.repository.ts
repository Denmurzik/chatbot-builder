import { Prisma, type Channel, type DialogState } from '@chatbot/db';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

// Строка dialog_context в виде, удобном движку
export interface DialogContextRow {
  id: string;
  botId: string | null;
  chatId: string;
  userId: string;
  channel: Channel;
  state: DialogState;
  currentBlockId: string | null;
  variables: Record<string, string>;
  currentRequestId: string | null;
}

@Injectable()
export class ContextRepository {
  // Создаёт строку контекста, если её нет: INSERT ... ON CONFLICT DO NOTHING убирает гонку
  // двух первых событий диалога. Для превью (bot_id NULL) уникальность не действует (NULL различны),
  // но превью в спринте 1 не обрабатывается.
  async ensureExists(
    tx: Prisma.TransactionClient,
    botId: string,
    chatId: string,
    userId: string,
    channel: Channel,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO dialog_context (id, bot_id, chat_id, user_id, channel, state, variables, updated_at)
      VALUES (${randomUUID()}, ${botId}, ${chatId}, ${userId}, ${channel}::"Channel", 'FINISHED'::"DialogState", '{}'::jsonb, now())
      ON CONFLICT (bot_id, chat_id) DO NOTHING`;
  }

  // Читает контекст диалога с блокировкой строки до конца транзакции (п. 2.2)
  async lockForUpdate(
    tx: Prisma.TransactionClient,
    botId: string | null,
    chatId: string,
  ): Promise<DialogContextRow | null> {
    const botCondition =
      botId === null ? Prisma.sql`bot_id IS NULL` : Prisma.sql`bot_id = ${botId}`;
    const rows = await tx.$queryRaw<DialogContextRow[]>`
      SELECT id, bot_id AS "botId", chat_id AS "chatId", user_id AS "userId", channel, state,
             current_block_id AS "currentBlockId", variables, current_request_id AS "currentRequestId"
      FROM dialog_context
      WHERE ${botCondition} AND chat_id = ${chatId}
      FOR UPDATE`;
    return rows[0] ?? null;
  }
}
