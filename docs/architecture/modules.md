# Архитектура модулей монорепозитория

Документ содержит сводные данные по реальной структуре модулей монорепозитория «Конструктор чат-ботов» и их зависимостям («использует») для построения слоистой диаграммы модулей в Visual Paradigm.

Подробное соответствие классов модели BCE и сущностей файлам кода зафиксировано в отдельном документе: [model-mapping.md](./model-mapping.md).

## Источник данных и проверка архитектуры

Граф зависимостей строится автоматически по реальным импортам TypeScript (`import` / `import type`, включая `imports: [...]` модулей NestJS) с помощью `dependency-cruiser` (конфигурация — [.dependency-cruiser.cjs](../../.dependency-cruiser.cjs)):

- Проверка архитектурных правил и отсутствия циклов:
  ```bash
  pnpm build && pnpm arch
  ```
- Перегенерация сырого графа модулей ([modules.dot](./modules.dot)):
  ```bash
  pnpm arch:graph
  ```

Сырой граф в формате Graphviz DOT сохранён рядом: [modules.dot](./modules.dot) (свёрнут по шаблону `packages/<pkg>` и `apps/<app>/src/<module>`, без `node_modules`, тестов и скриптов).

### Архитектурные ограничения (проверяются в CI)

1. `no-circular` — запрет циклических зависимостей между файлами.
2. `packages-no-apps` — пакеты `packages/*` не зависят от приложений `apps/*`.
3. `model-no-project-packages` — `@chatbot/model` не зависит ни от одного пакета или приложения проекта.
4. `engine-core-only-model` — `@chatbot/engine-core` из пакетов проекта зависит только от `@chatbot/model`.
5. `web-allowed-packages` — `apps/web` из пакетов проекта импортирует только `@chatbot/model` и `@chatbot/engine-core`.
6. `no-cross-app-imports` — запрет прямых импортов между приложениями `apps/api`, `apps/engine`, `apps/web`, `apps/mock-clinic` (взаимодействие идёт по HTTP и через очередь Redis/PostgreSQL).

### Проверка слоёв и ацикличности

- **Уровень файлов:** подтверждено `pnpm arch` (`no-circular` — 0 нарушений, 262 модуля и 840 зависимостей).
- **Уровень модулей:** 25 прикладных модулей плюс отдельное приложение `apps/mock-clinic` (сырой граф — [modules.dot](./modules.dot)). Основное направление межслойных зависимостей — сверху вниз (`взаимодействие → бизнес-логика → базовый`). После реализации спринтов 2–3 на уровне укрупнённых каталогов появились 4 прямые связи, которые стоит учитывать при обновлении диаграммы:
  - `api / ProjectModule` импортирует `EnvironmentService` из `api / PublicationModule` (для тестового окружения проекта), тогда как `api / PublicationModule` импортирует `ProjectModule` (на уровне файлов цикла нет);
  - `api / PublicationModule` использует `api / TelegramModule` (управление webhook и long polling при подключении/публикации);
  - `engine / DialogModule` напрямую использует `engine / PreviewModule` (`PreviewPublisher`);
  - `engine / DispatcherModule` использует `engine / HttpModule` (`HttpRequestExecutor` для восстановления незавершённых запросов при старте).
  Вспомогательные файлы (`apps/api/src/config.ts`, `common/`, `apps/engine/src/config.ts`, `apps/web/src/{app,components,i18n,lib}`) включены в состав соответствующих модулей или указаны в примечаниях; в `apps/engine` файл `config.ts` является частью `InfraModule`.

---

## Таблица модулей (исходные данные для диаграммы)

Слои сверху вниз:
1. **взаимодействие** — веб-интерфейс (`apps/web`), шлюзы Telegram (`api / TelegramModule`, `engine / MessengerModule`), исходящий HTTP-клиент (`engine / HttpModule`) и публикатор превью (`engine / PreviewModule`);
2. **бизнес-логика** — чистое ядро исполнения диалогов (`@chatbot/engine-core`), управление проектами, аутентификация, валидация, публикация, импорт/экспорт, превью (`apps/api`), исполнение диалогов и диспетчеризация событий (`engine / DialogModule`, `engine / DispatcherModule`);
3. **базовый** — разделяемые модели, хранилище БД, криптография, транспорт очереди и инфраструктурные DI-обёртки (`packages/{model,db,vault,queue}`, `api / {Prisma,Vault,Queue}Module`, `engine / InfraModule`).

| № | Модуль | Путь | Слой | Назначение | Классы модели | Использует (по реальным импортам) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `web / API-клиент` | `apps/web/src/api` | взаимодействие | HTTP-клиент к REST API (`apps/api`) для авторизации, проектов, ботов, валидации и импорта/экспорта | *(клиентский транспорт `apps/web`)* | `@chatbot/model` |
| 2 | `web / Страницы аккаунта` | `apps/web/src/pages` | взаимодействие | Экраны входа, регистрации, списка/создания проектов и управления ботами (окружение, подключение Telegram, публикация) | `AccountUI` | `@chatbot/model`, `web / API-клиент` |
| 3 | `web / Редактор сценария` | `apps/web/src/editor` | взаимодействие | Визуальный холст (React Flow) слева направо, панель «Что дальше?», окно блока «Вход — Настройки — Выход» для всех 10 типов, конструктор условий, поля выражений с подсказками, отмена/повтор, панель проверки, тестовое окружение, экспорт/импорт JSON | `EditorUI` | `@chatbot/engine-core`, `@chatbot/model`, `web / API-клиент`, `web / Превью-чат` |
| 4 | `web / Превью-чат` | `apps/web/src/preview` | взаимодействие | Окно превью: чат по Socket.IO (`/api/socket.io`, `/preview`), подсветка текущего блока, панель переменных, системные сообщения, перезапуск и восстановление сеанса | `PreviewChatUI` | `@chatbot/model` |
| 5 | `api / TelegramModule` | `apps/api/src/telegram` | взаимодействие | Приём webhook Telegram и long polling (`TELEGRAM_POLLING=1`), преобразование обновлений в `ChatEvent`, управление webhook и клиент Telegram Bot API (`TELEGRAM_PROXY`) | `MessengerGateway` (приём и управление) | `@chatbot/model`, `@chatbot/queue`, `@chatbot/vault`, `api / PrismaModule`, `api / QueueModule` |
| 6 | `engine / MessengerModule` | `apps/engine/src/messenger` | взаимодействие | Адаптер отправки сообщений, кнопок и системных сообщений в Telegram Bot API (grammY, `TELEGRAM_PROXY`), реализует порт `MessengerGateway` | `MessengerGateway` (отправка) | `@chatbot/db`, `@chatbot/engine-core`, `@chatbot/vault`, `engine / DialogModule`, `engine / InfraModule` |
| 7 | `engine / HttpModule` | `apps/engine/src/http` | взаимодействие | Исходящие HTTP-запросы с тайм-аутами, повторами (`undici` + `p-retry`) и фильтром `HTTP_ALLOWED_HOSTS`, возврат результата в очередь, разбор ответов, `ExternalApiHttpRequestLauncher` и `HttpRequestExecutor` (восстановление после перезапуска) | `ExternalApiClient`, `HttpRequestExecutor`, `ResponseParser` | `@chatbot/db`, `@chatbot/engine-core`, `@chatbot/model`, `@chatbot/queue`, `engine / DialogModule`, `engine / InfraModule` |
| 8 | `engine / PreviewModule` | `apps/engine/src/preview` | взаимодействие | Публикация событий `PreviewEvent` канала `PREVIEW` в Redis pub/sub `preview:<chatId>` (сообщения, текущий блок, переменные, системные сообщения) | `PreviewPublisher` | `@chatbot/model`, `engine / InfraModule` |
| 9 | `@chatbot/engine-core` | `packages/engine-core` | бизнес-логика | Чистое ядро диалогов без I/O: автопроход (лимит 100 шагов), безопасные выражения, шаблоны (1 проход), jsonPath, контекст в памяти | `DialogEngine` (ядро), `ExpressionEvaluator`, `DialogContext` (в памяти) | `@chatbot/model` |
| 10 | `api / AuthModule` | `apps/api/src/auth` | бизнес-логика | Регистрация, вход (argon2), выдача и проверка JWT-сессии в cookie (`JwtGuard`, `AuthService.authenticate`) | `AuthController` | `@chatbot/db`, `api / PrismaModule` |
| 11 | `api / ProjectModule` | `apps/api/src/projects` | бизнес-логика | CRUD проектов автора (список, создание, чтение), валидация и сохранение сценария, шифрование секретных заголовков и тестовое окружение проекта | `ProjectController`, `ScenarioEditor` | `@chatbot/db`, `@chatbot/model`, `@chatbot/vault`, `api / AuthModule`, `api / PrismaModule`, `api / PublicationModule` |
| 12 | `api / ValidatorModule` | `apps/api/src/validation` | бизнес-логика | Смысловая проверка графа сценария (`POST /api/projects/:projectId/validate`: точка входа, выходы, поля, шаблоны, выражения, jsonPath, циклы) | `ScenarioValidator`, `ValidationError` | `@chatbot/engine-core`, `@chatbot/model`, `api / AuthModule`, `api / PrismaModule` |
| 13 | `api / PublicationModule` | `apps/api/src/publication` | бизнес-логика | Управление ботами, рабочими окружениями с секретами, проверкой токена и подключением Telegram, публикацией и переопубликацией со сбросом контекстов | `PublicationController` | `@chatbot/db`, `@chatbot/model`, `@chatbot/vault`, `api / AuthModule`, `api / PrismaModule`, `api / ProjectModule`, `api / TelegramModule`, `api / ValidatorModule` |
| 14 | `api / ImportExportModule` | `apps/api/src/import-export` | бизнес-логика | Экспорт (`GET /api/projects/:id/export`, без значений секретных заголовков) и импорт (`POST /api/projects/:id/import`, проверка схемой Zod, число секретов для заполнения) | `ImportExportController` | `@chatbot/model`, `api / AuthModule`, `api / ProjectModule` |
| 15 | `api / PreviewGateway` | `apps/api/src/preview` | бизнес-логика | Socket.IO-шлюз превью (путь `/api/socket.io`, пространство имён `/preview`): проверка сессии, запуск, ввод и перезапуск диалога через очередь; `PreviewSubscriber` читает Redis pub/sub `preview:<chatId>` и передаёт события в комнату сеанса | `PreviewController` (реализован как шлюз) | `@chatbot/model`, `@chatbot/queue`, `api / AuthModule`, `api / PrismaModule`, `api / QueueModule` |
| 16 | `engine / DialogModule` | `apps/engine/src/dialog` | бизнес-логика | Транзакционная обработка событий диалога (`FOR UPDATE`), загрузка бота и окружения, провайдер `DialogEngine`, сохранение состояния, публикация превью, порты `MessengerGateway` и `HttpRequestLauncher` | `DialogEngine` (I/O-слой `DialogService`), `DialogContext` (`ContextRepository`) | `@chatbot/db`, `@chatbot/engine-core`, `@chatbot/model`, `@chatbot/vault`, `engine / InfraModule`, `engine / PreviewModule` |
| 17 | `engine / DispatcherModule` | `apps/engine/src/dispatcher` | бизнес-логика | 16 воркеров BullMQ (`events-0..15`), восстановление незавершённых HTTP-запросов при старте и диспетчеризация событий в `DialogService` | `EventDispatcher` | `@chatbot/engine-core`, `@chatbot/model`, `@chatbot/queue`, `engine / DialogModule`, `engine / HttpModule`, `engine / InfraModule` |
| 18 | `@chatbot/model` | `packages/model` | базовый | Формат сценария (`formatVersion: 1`), схемы Zod 10 типов блоков, выходы блоков, типы событий, окружений, секретов и `NotImplementedError` | `Scenario`, `Block` (10 типов), `Transition`, `HttpHeader`, `ResponseMapping`, `Event`, `EventType`, `Channel`, `DialogState`, `EnvironmentVariable`, `EncryptedSecret` | *(нет)* |
| 19 | `@chatbot/db` | `packages/db` | базовый | Схема PostgreSQL, миграции Prisma, фабрика `createPrismaClient` и реэкспорт типов Prisma | `Author`, `Project`, `Bot`, `MessengerConnection`, `DialogContext` (БД), `Request` (`HttpRequest`) | *(нет)* |
| 20 | `@chatbot/vault` | `packages/vault` | базовый | Шифрование секретов AES-256-GCM с AAD (`tokenAad`, `envAad`, `headerAad`), маскирование и HMAC-SHA-256 хеширование токенов | `SecretVault` | `@chatbot/model` |
| 21 | `@chatbot/queue` | `packages/queue` | базовый | 16-раздельная очередь событий BullMQ над Redis, партиционирование FNV-1a, фабрика Redis-соединения | *(инфраструктура `EventDispatcher`)* | `@chatbot/model` |
| 22 | `api / PrismaModule` | `apps/api/src/prisma` | базовый | Глобальный провайдер `PrismaService` для работы с PostgreSQL в `apps/api` | *(инфраструктура БД)* | `@chatbot/db` |
| 23 | `api / VaultModule` | `apps/api/src/vault` | базовый | Глобальный DI-провайдер `SecretVault` в `apps/api` | `SecretVault` (DI) | `@chatbot/vault` |
| 24 | `api / QueueModule` | `apps/api/src/queue` | базовый | Глобальный DI-провайдер `EventQueue` (`EVENT_QUEUE`) в `apps/api` | *(инфраструктура очереди)* | `@chatbot/queue` |
| 25 | `engine / InfraModule` | `apps/engine/src/infra` | базовый | Глобальный DI-модуль `apps/engine`: конфигурация (`config.ts`), `PRISMA`, `EVENT_QUEUE`, `SecretVault` | *(инфраструктура `apps/engine`)* | `@chatbot/db`, `@chatbot/queue`, `@chatbot/vault` |
| 26 | `apps/mock-clinic` | `apps/mock-clinic/src` | внешняя система | Тестовый HTTP API записи к врачу (`node:http`, порт `4010`, брони в памяти); отдельное приложение, не импортирует код других модулей, сценарий обращается к нему HTTP-блоком | *(тестовая внешняя система)* | *(нет)* |

---

## Примечания для построения диаграммы

- **Инверсия зависимостей через порты в `apps/engine`:** абстрактные порты `MessengerGateway` и `HttpRequestLauncher` (а также контракт `OutgoingHttpRequest`) объявлены в слое бизнес-логики (`apps/engine/src/dialog/ports.ts`). Модули слоя взаимодействия (`engine / MessengerModule` и `engine / HttpModule`) импортируют эти порты сверху вниз и предоставляют конкретные адаптеры (`TelegramMessengerGateway`, `ExternalApiHttpRequestLauncher`; `NoopHttpRequestLauncher` используется только в тестах). Связывание портов и адаптеров выполняется в точке композиции `apps/engine/src/app.module.ts` через `DialogModule.register({ imports: [MessengerModule, HttpModule] })`. Благодаря этому `DialogModule` не зависит от `MessengerModule` и `HttpModule`, `InfraModule` не зависит от `@chatbot/engine-core` (провайдер `DialogEngine` перенесён в `DialogModule`), а на уровне файлов циклов нет.
- **Межпроцессные связи (не являются импортами кода):**
  - `apps/web` → `apps/api` — по HTTP (REST JSON + cookie-сессия);
  - `apps/api` → `apps/engine` — асинхронно через очередь событий BullMQ/Redis (`@chatbot/queue`, 16 разделов);
  - `apps/api` → `apps/web` — события превью по Socket.IO; `apps/engine` → `apps/api` — через Redis pub/sub `preview:<chatId>`;
  - `apps/engine` → `apps/mock-clinic` — HTTP-запросы блока (в production только хосты из `HTTP_ALLOWED_HOSTS`);
  - `apps/api` и `apps/engine` разделяют базу PostgreSQL (`@chatbot/db`).
- **Корневые модули сборки NestJS:** `apps/api/src/app.module.ts` и `apps/engine/src/app.module.ts` (а также `apps/web/src/App.tsx` и `routes.tsx`) являются точками композиции приложений и не выносятся отдельными прикладными модулями на диаграмму.
- **Глобальные DI-провайдеры:** `api / VaultModule` помечен `@Global()`, поэтому `api / ProjectModule`, `api / PublicationModule` и `api / TelegramModule` внедряют `SecretVault` через токен класса из `@chatbot/vault` без прямого импорта `VaultModule`.
- **Вспомогательные каталоги `apps/web`:** `components/ui`, `app`, `i18n`, `lib` — общие UI-примитивы и локализация внутри фронтенда; в таблице показаны только прикладные области (`pages`, `editor`, `preview`) и клиент `api`.
