import { BadGatewayException } from '@nestjs/common';
import { GrammyError, HttpError } from 'grammy';
import { describe, expect, it } from 'vitest';
import type { TelegramApiFactory } from '../telegram/telegram-api.factory';
import { TelegramTokenVerifier } from './telegram-token.verifier';

const grammyError = (code: number) =>
  new GrammyError('getMe failed', { ok: false, error_code: code, description: 'x' }, 'getMe', {});

function verifier(getMe: () => Promise<{ username?: string }>): TelegramTokenVerifier {
  const factory = { create: () => ({ getMe }) } as unknown as TelegramApiFactory;
  return new TelegramTokenVerifier(factory);
}

describe('TelegramTokenVerifier', () => {
  it('возвращает имя бота для действительного токена', async () => {
    await expect(verifier(async () => ({ username: 'my_bot' })).verify('t')).resolves.toEqual({
      username: 'my_bot',
    });
  });

  it('401 и 404 от Telegram — токен недействителен (null)', async () => {
    for (const code of [401, 404]) {
      await expect(
        verifier(() => Promise.reject(grammyError(code))).verify('t'),
      ).resolves.toBeNull();
    }
  });

  it('сетевая ошибка и прочие ответы Telegram — 502', async () => {
    await expect(
      verifier(() => Promise.reject(new HttpError('net', new Error('down')))).verify('t'),
    ).rejects.toThrow(BadGatewayException);
    await expect(verifier(() => Promise.reject(grammyError(500))).verify('t')).rejects.toThrow(
      'Telegram недоступен, попробуйте позже',
    );
  });
});
