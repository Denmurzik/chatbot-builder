import { z } from 'zod';
import { envVarViewSchema } from './environment';

// Статус бота и представление бота для клиента (без токенов и секретов)
export const botStatusSchema = z.enum(['CREATED', 'PUBLISHED']);

export const botViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: botStatusSchema,
  publishedAt: z.string().nullable(),
  connections: z.array(z.object({ messenger: z.literal('TELEGRAM'), tokenMask: z.string() })),
  environment: z.array(envVarViewSchema),
});

export type BotView = z.infer<typeof botViewSchema>;
