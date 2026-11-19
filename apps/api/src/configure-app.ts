import { type INestApplication, RequestMethod } from '@nestjs/common';
import cookieParser from 'cookie-parser';

// Общая настройка HTTP-приложения: cookie-parser и глобальный префикс /api (кроме webhook/*)
export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'webhook/(.*)', method: RequestMethod.ALL }],
  });
}
