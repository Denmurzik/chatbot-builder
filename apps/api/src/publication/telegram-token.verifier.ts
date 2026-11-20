import { BadGatewayException, Injectable } from '@nestjs/common';
import { GrammyError } from 'grammy';
import { TelegramApiFactory } from '../telegram/telegram-api.factory';

// Проверка токена Telegram вызовом getMe (тайм-аут 10 с задаёт фабрика); в тестах подменяется
@Injectable()
export class TelegramTokenVerifier {
  constructor(private readonly apiFactory: TelegramApiFactory) {}

  // null — токен недействителен; недоступность Telegram -> 502
  async verify(token: string): Promise<{ username: string } | null> {
    try {
      const me = await this.apiFactory.create(token).getMe();
      return { username: me.username ?? '' };
    } catch (err) {
      if (err instanceof GrammyError && (err.error_code === 401 || err.error_code === 404)) {
        return null;
      }
      throw new BadGatewayException('Telegram недоступен, попробуйте позже');
    }
  }
}
