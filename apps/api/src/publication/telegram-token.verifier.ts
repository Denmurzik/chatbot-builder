import { Injectable } from '@nestjs/common';
import { Api } from 'grammy';

// Проверка токена Telegram вызовом getMe; в тестах подменяется
@Injectable()
export class TelegramTokenVerifier {
  async verify(token: string): Promise<{ username: string } | null> {
    try {
      const me = await new Api(token).getMe();
      return { username: me.username ?? '' };
    } catch {
      return null;
    }
  }
}
