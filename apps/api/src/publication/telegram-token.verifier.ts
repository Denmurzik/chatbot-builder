import { BadGatewayException, Injectable } from '@nestjs/common';
import { Api, GrammyError } from 'grammy';

const REQUEST_TIMEOUT_SECONDS = 10;

// Проверка токена Telegram вызовом getMe; в тестах подменяется
@Injectable()
export class TelegramTokenVerifier {
  // null — токен недействителен; недоступность Telegram -> 502
  async verify(token: string): Promise<{ username: string } | null> {
    try {
      const me = await new Api(token, { timeoutSeconds: REQUEST_TIMEOUT_SECONDS }).getMe();
      return { username: me.username ?? '' };
    } catch (err) {
      if (err instanceof GrammyError && (err.error_code === 401 || err.error_code === 404)) {
        return null;
      }
      throw new BadGatewayException('Telegram недоступен, попробуйте позже');
    }
  }
}
