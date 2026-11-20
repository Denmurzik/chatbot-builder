import { z } from 'zod';

export const createBotBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Название бота не может быть пустым')
    .max(200, 'Название бота слишком длинное'),
});

export const connectTelegramBodySchema = z.object({
  token: z.string().trim().min(1, 'Введите токен бота'),
});

export type CreateBotBody = z.infer<typeof createBotBodySchema>;
export type ConnectTelegramBody = z.infer<typeof connectTelegramBodySchema>;
