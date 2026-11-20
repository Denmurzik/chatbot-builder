import { describe, expect, it, vi } from 'vitest';

const started: Array<{ token: string; stop: ReturnType<typeof vi.fn> }> = [];

// Подмена grammY: опрос не ходит в сеть
vi.mock('grammy', () => ({
  Bot: class {
    readonly stop = vi.fn(async () => undefined);
    constructor(readonly token: string) {
      started.push({ token, stop: this.stop });
    }
    use(): void {}
    start(): Promise<void> {
      return new Promise(() => undefined);
    }
  },
  Api: class {},
  GrammyError: class extends Error {},
}));

import type { ApiConfig } from '../config';
import { PollingService } from './polling.service';
import { TelegramWebhookService } from './telegram-webhook.service';

describe('смена токена в режиме polling', () => {
  it('disconnect(old) после connect(new) не останавливает опрос с новым токеном', async () => {
    const config = { telegramPolling: true } as ApiConfig;
    const polling = new PollingService(config, {} as never, {} as never, {} as never);
    const api = { create: () => ({ deleteWebhook: async () => undefined }) };
    const service = new TelegramWebhookService(config, api as never, polling);

    await service.connect('bot-1', 'T1');
    await service.connect('bot-1', 'T2'); // перезапуск: T1 остановлен
    await service.disconnect('bot-1', 'T1'); // старый токен: опрос с T2 не трогаем

    const t1 = started.find((b) => b.token === 'T1')!;
    const t2 = started.find((b) => b.token === 'T2')!;
    expect(t1.stop).toHaveBeenCalledTimes(1);
    expect(t2.stop).not.toHaveBeenCalled();

    await service.disconnect('bot-1', 'T2');
    expect(t2.stop).toHaveBeenCalledTimes(1);
  });
});
