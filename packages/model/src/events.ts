import { z } from 'zod';

// Типы событий, поступающих в движок диалогов
export const EVENT_TYPES = [
  'START_COMMAND',
  'TEXT_MESSAGE',
  'BUTTON_PRESS',
  'RESPONSE_RECEIVED',
  'REQUEST_FAILED',
  'VERSION_PUBLISHED',
] as const;

export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof eventTypeSchema>;

// Канал взаимодействия с пользователем
export const CHANNELS = ['MESSENGER', 'PREVIEW'] as const;

export const channelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof channelSchema>;

// Состояния конечного автомата диалога
export const DIALOG_STATES = [
  'RUNNING',
  'WAITING_USER',
  'WAITING_EXTERNAL',
  'SUSPENDED',
  'FINISHED',
] as const;

export const dialogStateSchema = z.enum(DIALOG_STATES);
export type DialogState = z.infer<typeof dialogStateSchema>;

// Входящее событие диалога (кладётся в очередь и передаётся в DialogEngine)
export const chatEventSchema = z.object({
  type: eventTypeSchema,
  channel: channelSchema,
  botId: z.string().nullable(),
  chatId: z.string(),
  userId: z.string(),
  payload: z.string().optional(),
  sourceBlockId: z.string().optional(),
  requestId: z.string().optional(),
});

export type ChatEvent = z.infer<typeof chatEventSchema>;
