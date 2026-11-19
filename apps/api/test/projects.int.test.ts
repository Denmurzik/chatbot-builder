import 'reflect-metadata';
import { emptyScenario, type Scenario } from '@chatbot/model';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { createIsolatedTestDb, type IsolatedTestDb } from './test-db';

describe('Projects API (интеграционные тесты)', () => {
  let db: IsolatedTestDb;
  let app: INestApplication;
  const prevEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    TELEGRAM_POLLING: process.env.TELEGRAM_POLLING,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeAll(async () => {
    db = await createIsolatedTestDb();
    process.env.DATABASE_URL = db.databaseUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-projects-tests';
    process.env.TELEGRAM_POLLING = '0';
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    process.env.DATABASE_URL = prevEnv.DATABASE_URL;
    process.env.JWT_SECRET = prevEnv.JWT_SECRET;
    process.env.TELEGRAM_POLLING = prevEnv.TELEGRAM_POLLING;
    process.env.NODE_ENV = prevEnv.NODE_ENV;
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  async function createAuthenticatedAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    return agent;
  }

  it('все маршруты проектов без cookie возвращают 401', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/projects').expect(401);
    await request(server).post('/api/projects').send({ name: 'Тест' }).expect(401);
    await request(server).get('/api/projects/non-existent').expect(401);
    await request(server)
      .put('/api/projects/non-existent/scenario')
      .send(emptyScenario())
      .expect(401);
  });

  it('CRUD проектов: создание с emptyScenario(), список, чтение по id, 404 на несуществующий', async () => {
    const agent = await createAuthenticatedAgent('owner@example.com');

    // Пустой список
    const emptyList = await agent.get('/api/projects').expect(200);
    expect(emptyList.body).toEqual([]);

    // Создание проекта
    const created = await agent
      .post('/api/projects')
      .send({ name: 'Запись к врачу' })
      .expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'Запись к врачу',
      scenario: emptyScenario(),
    });

    // Список проектов
    const list = await agent.get('/api/projects').expect(200);
    expect(list.body).toEqual([
      {
        id: created.body.id,
        name: 'Запись к врачу',
        updatedAt: expect.any(String),
      },
    ]);

    // Получение проекта по id
    const fetched = await agent.get(`/api/projects/${created.body.id}`).expect(200);
    expect(fetched.body).toEqual({
      id: created.body.id,
      name: 'Запись к врачу',
      scenario: emptyScenario(),
      updatedAt: expect.any(String),
    });

    // Несуществующий проект — 404
    await agent.get('/api/projects/00000000-0000-0000-0000-000000000000').expect(404);
    await agent
      .put('/api/projects/00000000-0000-0000-0000-000000000000/scenario')
      .send(emptyScenario())
      .expect(404);

    // Пустое название проекта — 400
    const badCreate = await agent.post('/api/projects').send({ name: '   ' }).expect(400);
    expect(badCreate.body).toMatchObject({
      message: expect.any(String),
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'name', message: expect.any(String) }),
      ]),
    });
  });

  it('PUT /api/projects/:id/scenario — сохраняет валидный сценарий и возвращает updatedAt', async () => {
    const agent = await createAuthenticatedAgent('editor@example.com');
    const created = await agent
      .post('/api/projects')
      .send({ name: 'Эхо' })
      .expect(201);

    const validScenario: Scenario = {
      formatVersion: 1,
      blocks: [
        { id: 'entry', type: 'ENTRY_POINT', title: 'Старт', x: 0, y: 0 },
        { id: 'msg1', type: 'TEXT_MESSAGE', title: 'Приветствие', x: 200, y: 0, text: 'Привет!' },
        { id: 'exit', type: 'EXIT_POINT', title: 'Конец', x: 400, y: 0 },
      ],
      transitions: [
        { source: { blockId: 'entry', output: 'default' }, target: 'msg1' },
        { source: { blockId: 'msg1', output: 'default' }, target: 'exit' },
      ],
    };

    const putRes = await agent
      .put(`/api/projects/${created.body.id}/scenario`)
      .send(validScenario)
      .expect(200);

    expect(putRes.body).toEqual({
      updatedAt: expect.any(String),
    });

    const fetched = await agent.get(`/api/projects/${created.body.id}`).expect(200);
    expect(fetched.body.scenario).toEqual(validScenario);
  });

  it('Review Focus 3: переход на удалённый блок или два перехода из одного выхода → 400, прежний сценарий в БД не портится', async () => {
    const agent = await createAuthenticatedAgent('focus3@example.com');
    const created = await agent
      .post('/api/projects')
      .send({ name: 'Проверка графа' })
      .expect(201);

    const initialScenario: Scenario = {
      formatVersion: 1,
      blocks: [
        { id: 'entry', type: 'ENTRY_POINT', title: 'Старт', x: 0, y: 0 },
        { id: 'msg1', type: 'TEXT_MESSAGE', title: 'Сообщение', x: 100, y: 0, text: 'Ок' },
      ],
      transitions: [{ source: { blockId: 'entry', output: 'default' }, target: 'msg1' }],
    };

    await agent
      .put(`/api/projects/${created.body.id}/scenario`)
      .send(initialScenario)
      .expect(200);

    // Переход на удалённый блок
    const danglingScenario = {
      formatVersion: 1,
      blocks: [{ id: 'entry', type: 'ENTRY_POINT', title: 'Старт', x: 0, y: 0 }],
      transitions: [{ source: { blockId: 'entry', output: 'default' }, target: 'deleted_block' }],
    };

    const err1 = await agent
      .put(`/api/projects/${created.body.id}/scenario`)
      .send(danglingScenario)
      .expect(400);

    expect(err1.body).toMatchObject({
      message: expect.any(String),
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: 'transitions.0.target',
          message: expect.any(String),
        }),
      ]),
    });

    // В базе остался прежний сценарий
    const afterErr1 = await agent.get(`/api/projects/${created.body.id}`).expect(200);
    expect(afterErr1.body.scenario).toEqual(initialScenario);

    // Два перехода из одного выхода
    const duplicateOutputScenario = {
      formatVersion: 1,
      blocks: [
        { id: 'entry', type: 'ENTRY_POINT', title: 'Старт', x: 0, y: 0 },
        { id: 'msg1', type: 'TEXT_MESSAGE', title: 'А', x: 100, y: 0, text: 'А' },
        { id: 'msg2', type: 'TEXT_MESSAGE', title: 'Б', x: 100, y: 100, text: 'Б' },
      ],
      transitions: [
        { source: { blockId: 'entry', output: 'default' }, target: 'msg1' },
        { source: { blockId: 'entry', output: 'default' }, target: 'msg2' },
      ],
    };

    const err2 = await agent
      .put(`/api/projects/${created.body.id}/scenario`)
      .send(duplicateOutputScenario)
      .expect(400);

    expect(err2.body).toMatchObject({
      message: expect.any(String),
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: 'transitions.1.source',
          message: expect.any(String),
        }),
      ]),
    });

    // В базе по-прежнему исходный сценарий
    const afterErr2 = await agent.get(`/api/projects/${created.body.id}`).expect(200);
    expect(afterErr2.body.scenario).toEqual(initialScenario);
  });

  it('изоляция авторов (п. 2.12): автор B получает 404 на проект автора A и не видит его в списке', async () => {
    const agentA = await createAuthenticatedAgent('author-a@example.com');
    const agentB = await createAuthenticatedAgent('author-b@example.com');

    const projectA = await agentA
      .post('/api/projects')
      .send({ name: 'Секретный проект A' })
      .expect(201);

    // Автор A сохраняет непустой сценарий
    const scenarioA: Scenario = {
      formatVersion: 1,
      blocks: [
        { id: 'entry', type: 'ENTRY_POINT', title: 'Старт', x: 0, y: 0 },
        { id: 'msgA', type: 'TEXT_MESSAGE', title: 'Текст A', x: 120, y: 0, text: 'Только для A' },
      ],
      transitions: [{ source: { blockId: 'entry', output: 'default' }, target: 'msgA' }],
    };
    await agentA
      .put(`/api/projects/${projectA.body.id}/scenario`)
      .send(scenarioA)
      .expect(200);

    // Автор B не видит проект A в своём списке
    const listB = await agentB.get('/api/projects').expect(200);
    expect(listB.body).toEqual([]);

    // Автор B получает 404 при чтении и сохранении проекта A
    await agentB.get(`/api/projects/${projectA.body.id}`).expect(404);
    await agentB
      .put(`/api/projects/${projectA.body.id}/scenario`)
      .send(emptyScenario())
      .expect(404);

    // Сценарий проекта A остался неизменным после попытки автора B
    const afterB = await agentA.get(`/api/projects/${projectA.body.id}`).expect(200);
    expect(afterB.body.scenario).toEqual(scenarioA);
  });
});
