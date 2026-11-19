// Число разделов очереди событий (п. 2.2 спецификации)
export const PARTITIONS = 16;

// Ключ диалога: события одного диалога всегда попадают в один раздел
export function dialogKey(botId: string | null, chatId: string): string {
  return `${botId ?? 'preview'}:${chatId}`;
}

// FNV-1a 32 бита по UTF-8 байтам ключа, остаток от деления на число разделов
export function partitionOf(key: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(key, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0) % PARTITIONS;
}

export function queueName(partition: number): string {
  return `events-${partition}`;
}
