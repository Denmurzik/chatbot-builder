# Конструктор чат-ботов

Монорепозиторий платформы для визуального создания, тестирования и публикации чат-ботов.

## Требования

- **Node.js** `>= 22` (LTS)
- **pnpm** `9.x` (включается через Corepack: `corepack enable`)
- **Docker** и **Docker Compose** (для локального запуска PostgreSQL 16 и Redis 7)

## Структура репозитория

- `packages/model` (`@chatbot/model`) — типы сценария, блоков, событий и схемы валидации Zod
- `packages/engine-core` (`@chatbot/engine-core`) — шаблоны, безопасные выражения, jsonPath, движок диалогов
- `packages/vault` (`@chatbot/vault`) — шифрование секретов (AES-256-GCM) и хеширование токенов
- `packages/db` (`@chatbot/db`) — схема Prisma и доступ к PostgreSQL
- `packages/queue` (`@chatbot/queue`) — очередь событий BullMQ (16 разделов по ключу диалога)
- `apps/api` (`@chatbot/api`) — REST API, webhook мессенджеров и Socket.IO-шлюз превью (NestJS, порт `3000`)
- `apps/engine` (`@chatbot/engine`) — воркеры очереди событий и HTTP-клиент внешних систем (NestJS)
- `apps/web` (`@chatbot/web`) — веб-редактор сценариев и интерфейс превью (React 18 + Vite, порт `5173`)
- `apps/mock-clinic` (`@chatbot/mock-clinic`) — тестовый HTTP API записи к врачу (`node:http`, порт `4010`)

## Быстрый старт

1. Включите Corepack и установите зависимости:

   ```bash
   corepack enable
   pnpm install
   ```

2. Скопируйте файл переменных окружения и при необходимости заполните значения:

   ```bash
   cp .env.example .env
   ```

3. Запустите локальную инфраструктуру (PostgreSQL на порту `55432` и Redis на порту `56379`):

   ```bash
   pnpm infra:up
   ```

   Остановить контейнеры:

   ```bash
   pnpm infra:down
   ```

## Работа в worktree

Все worktree используют общий проект Docker Compose (`name: chatbot`), поэтому поднимать контейнеры повторно не нужно. В новом worktree выполните:

```bash
cp .env.example .env
pnpm install
# После появления схемы Prisma (задача 5):
pnpm --filter @chatbot/db db:generate
```

## Основные команды

| Команда | Назначение |
| --- | --- |
| `pnpm build` | Сборка всех пакетов и приложений (`tsc -b` + `vite build`) |
| `pnpm test` | Запуск модульных тестов (Vitest, без `*.int.test.ts`) |
| `pnpm test:int` | Запуск интеграционных тестов (`*.int.test.ts`, последовательно, нужен `pnpm infra:up`) |
| `pnpm lint` | Проверка кода ESLint |
| `pnpm test:e2e` | Сквозные тесты интерфейса (Playwright, Chromium; нужны запущенные инфраструктура и приложения) |
| `pnpm test:load` | Нагрузочный тест (`scripts/load-test.ts`) |
| `pnpm arch` | Проверка архитектурных правил (dependency-cruiser): слои, строгий DAG, отсутствие циклов |
| `pnpm arch:graph` | Перегенерация графа модулей `docs/architecture/modules.dot` |
| `pnpm typecheck` | Проверка типов TypeScript (`tsc -b` по ссылкам проектов + `apps/web`) |
| `pnpm infra:up` | Запуск PostgreSQL 16 и Redis 7 в Docker Compose |
| `pnpm infra:down` | Остановка контейнеров инфраструктуры |
| `pnpm dev:api` | Запуск `apps/api` в режиме разработки |
| `pnpm dev:engine` | Запуск `apps/engine` в режиме разработки |
| `pnpm dev:web` | Запуск `apps/web` (Vite dev server) |
| `pnpm dev:mock-clinic` | Запуск тестового HTTP API клиники (`apps/mock-clinic`, порт `4010`) |

## Запуск сценариев спринта 1

1. Поднимите инфраструктуру и примените миграции PostgreSQL:

   ```bash
   pnpm infra:up
   pnpm --filter @chatbot/db db:migrate
   ```

2. Заполните базу тестовыми данными (автор, проект «Эхо» и опубликованный эхо-бот). Если задать `TELEGRAM_DEV_TOKEN` в `.env`, скрипт дополнительно создаст зашифрованное подключение Telegram:

   ```bash
   pnpm --filter @chatbot/api seed:dev
   ```

   Тестовая учётная запись веб-редактора (из `seed:dev`):
   - **Email:** `dev@example.com`
   - **Пароль:** `devpassword`

   Для локальной отладки эхо-бота через long polling укажите в `.env` `TELEGRAM_DEV_TOKEN=<токен>` и `TELEGRAM_POLLING=1`.

3. Запустите приложения (в трёх терминалах):

   ```bash
   pnpm dev:api
   pnpm dev:engine
   pnpm dev:web
   ```

4. Консольный чат движка (сценарий «Запись к врачу» без HTTP):

   ```bash
   pnpm --filter @chatbot/engine-core chat examples/doctor-no-http.json
   ```

5. Прототип П1 (проверка обработки событий, очереди и HTTP-клиента):

   ```bash
   pnpm --filter @chatbot/engine p1
   # с проверкой исходящего HTTP-запроса:
   pnpm --filter @chatbot/engine p1 -- --http
   ```

## Превью, экспорт и импорт сценария

- **Превью в редакторе** — выдвижная панель чата, подключённая по Socket.IO (`path: /api/socket.io`, `namespace: /preview`). События проходят через ту же очередь и `apps/engine`, а ответы движка приходят из Redis pub/sub (`preview:<chatId>`). Превью использует тестовое окружение проекта (настраивается в редакторе), подсвечивает текущий блок на холсте, показывает переменные диалога и системные сообщения отдельным видом, поддерживает перезапуск.
- **Экспорт и импорт JSON и YAML** — доступны из редактора и по REST API (формат выбирается параметром `?format=json` или `?format=yaml`, по умолчанию JSON):
  - `GET /api/projects/:id/export?format=json|yaml` — выгружает сценарий без значений секретных заголовков;
  - `POST /api/projects/:id/import?format=json|yaml` — проверяет сценарий схемой Zod, сохраняет сценарий в проект и сообщает, сколько секретов нужно заполнить.
- **Сквозной тест записи к врачу** (нужен `pnpm infra:up`):
  ```bash
  pnpm exec vitest run apps/engine/test/doctor-flow.int.test.ts
  ```
  Прогоняет сценарий `doctor-with-http.json` через `apps/engine` и `apps/mock-clinic`, включая сбои API и изоляцию ботов.

## Проекты, проверка сценария и публикация

- **Проекты** — `GET /api/projects` возвращает проекты с числом ботов (`botsCount`); проект можно переименовать и удалить. Удаление каскадное: боты проекта предварительно отключаются от мессенджеров (webhook Telegram, Callback API или Long Poll VK), затем удаляются вместе с окружениями и контекстами диалогов. Значения секретных заголовков в ответах API не возвращаются — только маска (`secretMask`).
- **Проверка сценария** — `POST /api/projects/:projectId/validate` возвращает ошибки и 4 предупреждения: цикл в сценарии, недостижимые блоки, переменные, которые нигде не записываются, и не заданные переменные окружения.
- **Публикация** — бота можно подключить к Telegram или VK (несколько мессенджеров на бота), токен проверяется на уникальность.

## Поддержка VK

Бот публикуется в сообщество VK двумя способами:

- **Callback API** — события приходят на `POST /webhook/vk/:botId` (`PUBLIC_URL` должен быть доступен из интернета; подтверждение сервера и секрет проверяются автоматически);
- **Bots Long Poll** — `api` сам опрашивает VK (для локальной отладки и сетей без входящих соединений); управляется `VK_POLLING` (по умолчанию включён, `VK_POLLING=0` отключает).

Переменные окружения:
- `VK_POLLING` — `0` отключает Bots Long Poll в `api`;
- `VK_API_BASE_URL` — базовый адрес VK API (по умолчанию `https://api.vk.com/method`; переопределяется для тестов и прокси).

Исходящие сообщения engine маршрутизирует по префиксу чата: `tg:` — Telegram, `vk:` — VK.

## Тестовый API записи к врачу (`apps/mock-clinic`)

Зависимостей нет (чистый `node:http`), данные о бронях хранятся в памяти процесса.

```bash
pnpm dev:mock-clinic
# или после сборки:
pnpm --filter @chatbot/mock-clinic start
```

Переменные окружения:
- `MOCK_CLINIC_PORT` — порт сервера (по умолчанию `4010`)
- `MOCK_CLINIC_API_KEY` — ключ для заголовка `X-Api-Key` (по умолчанию `test-key`)

Эндпоинты (все требуют `X-Api-Key`):
- `GET /doctors` — список врачей
- `GET /slots?doctorId=d1` — свободные слоты врача
- `POST /bookings` — бронь слота (`{"slotId","patient"}`), повторная бронь возвращает `409`
- Заголовок `X-Mock-Fail: 500` имитирует ошибку 500, `X-Mock-Fail: timeout` — задержку ответа 30 с

Пример сценария для работы с этим API: `packages/engine-core/examples/doctor-with-http.json` (требует переменные окружения сценария `API_URL=http://127.0.0.1:4010` и `API_KEY=test-key`).

## Развёртывание на сервере

Docker-образы, Compose для сервера за Nginx Proxy Manager и инструкция — в [`deploy/README.md`](deploy/README.md).
