import { Prisma, type Channel, type DialogState } from '@chatbot/db';
import { Injectable } from '@nestjs/common';

// Строка dialog_context в виде, удобном движку
export interface DialogContextRow {
  id: string;
  botId: string | null;
  chatId: string;
  userId: string;
  channel: Channel;
  state: DialogState;
  currentBlockId: string;
  variables: Record<string, string>;
  currentRequestId: string | null;
}

@Injectable()
export class ContextRepository {
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
