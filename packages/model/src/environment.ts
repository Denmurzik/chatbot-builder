import { z } from 'zod';

// Зашифрованное значение секрета и его маска для отображения в интерфейсе (п. 2.13)
export const encryptedSecretSchema = z.object({
  cipherText: z.string(),
  mask: z.string(),
});

export type EncryptedSecret = z.infer<typeof encryptedSecretSchema>;

// Переменная окружения проекта (тестового) или бота (рабочего) (п. 3.3)
export const environmentVariableSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
  secret: z.boolean(),
  secretValue: encryptedSecretSchema.optional(),
});

export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;

// Список переменных окружения (JSONB-массив в project.environment / bot.environment)
export const environmentSchema = z.array(environmentVariableSchema);

export type Environment = z.infer<typeof environmentSchema>;
