import { type INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

// Общая настройка HTTP-приложения: лимит JSON 1 МБ, cookie-parser и глобальный префикс /api (кроме webhook/*)
export function configureApp(app: INestApplication): void {
  (app as NestExpressApplication).useBodyParser('json', { limit: '1mb' });
  app.use(cookieParser());
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'webhook/(.*)', method: RequestMethod.ALL }],
  });
}
