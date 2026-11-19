import 'reflect-metadata';
import { Controller, Get, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { configureApp } from './configure-app';

@Controller('health')
class HealthController {
  @Get()
  check(@Req() req: Request) {
    return { ok: true, session: req.cookies?.session ?? null };
  }
}

@Controller('webhook')
class DummyWebhookController {
  @Post('telegram/:botId')
  handle() {
    return { webhook: true };
  }
}

describe('configureApp', () => {
  it('подключает cookie-parser, глобальный префикс /api и исключает webhook/(.*)', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, DummyWebhookController],
    }).compile();

    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    try {
      const apiRes = await request(app.getHttpServer())
        .get('/api/health')
        .set('Cookie', ['session=abc'])
        .expect(200);
      expect(apiRes.body).toEqual({ ok: true, session: 'abc' });

      // Без префикса /api обычный маршрут недоступен
      await request(app.getHttpServer()).get('/health').expect(404);

      // Маршрут webhook/* доступен без префикса /api
      const whRes = await request(app.getHttpServer())
        .post('/webhook/telegram/bot-1')
        .expect(201);
      expect(whRes.body).toEqual({ webhook: true });
    } finally {
      await app.close();
    }
  });
});
