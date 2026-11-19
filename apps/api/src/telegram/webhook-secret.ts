import { createHmac } from 'node:crypto';

// Секрет webhook бота: HMAC-SHA-256(VAULT_HASH_KEY, 'webhook:' + botId) в hex (п. 2.12);
// отдельный столбец не нужен, секрет всегда вычисляется из botId
export function webhookSecret(botId: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.VAULT_HASH_KEY;
  if (!raw) throw new Error('Не задана переменная окружения VAULT_HASH_KEY');
  return createHmac('sha256', Buffer.from(raw, 'base64')).update(`webhook:${botId}`).digest('hex');
}
