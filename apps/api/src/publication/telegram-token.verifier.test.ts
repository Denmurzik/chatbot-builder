import { BadGatewayException } from '@nestjs/common';
import { Api, GrammyError, HttpError } from 'grammy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramTokenVerifier } from './telegram-token.verifier';

const grammyError = (code: number) =>
  new GrammyError('getMe failed', { ok: false, error_code: code, description: 'x' }, 'getMe', {});

describe('TelegramTokenVerifier', () => {
  afterEach(() => vi.restoreAllMocks());

  it('возвращает имя бота для действительного токена', async () => {
    vi.spyOn(Api.prototype, 'getMe').mockResolvedValue({ username: 'my_bot' } as never);
    await expect(new TelegramTokenVerifier().verify('t')).resolves.toEqual({ username: 'my_bot' });
  });

  it('401 и 404 от Telegram — токен недействителен (null)', async () => {
    for (const code of [401, 404]) {
      vi.spyOn(Api.prototype, 'getMe').mockRejectedValue(grammyError(code));
      await expect(new TelegramTokenVerifier().verify('t')).resolves.toBeNull();
    }
  });

  it('сетевая ошибка и прочие ответы Telegram — 502', async () => {
    vi.spyOn(Api.prototype, 'getMe').mockRejectedValue(new HttpError('net', new Error('down')));
    await expect(new TelegramTokenVerifier().verify('t')).rejects.toThrow(BadGatewayException);
    vi.spyOn(Api.prototype, 'getMe').mockRejectedValue(grammyError(500));
    await expect(new TelegramTokenVerifier().verify('t')).rejects.toThrow(
      'Telegram недоступен, попробуйте позже',
    );
  });
});
