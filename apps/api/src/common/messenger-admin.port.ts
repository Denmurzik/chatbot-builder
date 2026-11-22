// Порт администрирования мессенджера (базовый слой common: доступен projects, publication и telegram)
export abstract class MessengerAdminPort {
  // Подключает бота к мессенджеру (webhook или polling); ошибка внешней системы -> 502
  abstract connect(botId: string, token: string): Promise<void>;

  // Отключает бота от мессенджера (best-effort)
  abstract disconnect(botId: string, token: string): Promise<void>;

  // Проверяет токен бота; null — токен недействителен, недоступность мессенджера -> 502
  abstract verifyToken(token: string): Promise<{ username: string } | null>;
}
