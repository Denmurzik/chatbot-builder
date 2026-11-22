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
7. `api-business-no-interaction` — в `apps/api` слой бизнес-логики (`auth`, `projects`, `validation`, `publication`, `import-export`, `preview`) не зависит от слоя взаимодействия (`telegram`, `vk`).
8. `api-base-no-upper-layers` — в `apps/api` базовый слой (`prisma`, `vault`, `queue`, `common`) не зависит от слоёв бизнес-логики или взаимодействия.
9. `api-projects-publication-isolated` — в `apps/api` модули `projects` и `publication` не зависят друг от друга.
10. `engine-business-no-interaction` — в `apps/engine` слой бизнес-логики (`dialog`, `dispatcher`) не зависит от слоя взаимодействия (`messenger`, `http`, `preview`).
11. `engine-base-no-upper-layers` — в `apps/engine` базовый слой (`infra`) не зависит от слоёв бизнес-логики или взаимодействия.

Слоистые правила (п. 7–11) исключают точки композиции (`app.module.ts`, `main.ts`, `configure-app.ts`, `index.ts`, `config.ts`) и тесты (`*.test.ts`, `testing/`).

### Проверка слоёв и ацикличности

- **Уровень файлов:** подтверждено `pnpm arch` (`no-circular` и все слоистые правила — 0 нарушений, 275 модулей и 908 зависимостей).
- **Уровень модулей:** 26 прикладных модулей плюс отдельное приложение `apps/mock-clinic` (сырой граф — [modules.dot](./modules.dot)). Граф зависимостей образует **строгий DAG** с направлением межслойных связей исключительно сверху вниз (`взаимодействие → бизнес-логика → базовый`):
  - `EnvironmentService` вынесен в базовый каталог `apps/api/src/common/`, поэтому `api / ProjectModule` и `api / PublicationModule` больше не зависят друг от друга;
  - `api / ProjectModule` и `api / PublicationModule` зависят от абстрактного порта `MessengerAdminPort` из базового каталога `common/`, а его реализации — `TelegramAdminAdapter` (`api / TelegramModule`) и `VkAdminAdapter` (`api / VkModule`) — маршрутизируются по типу мессенджера композитным `CompositeMessengerAdminPort` (связывание выполняется в `AppModule`: `register({ imports: [TelegramModule, VkModule] })`), поэтому зависимостей бизнес-логика → взаимодействие нет;
  - `engine / MessengerModule` предоставляет `CompositeMessengerGateway`, который маршрутизирует исходящие сообщения по префиксу идентификатора чата: `tg:` → `TelegramMessengerGateway`, `vk:` → `VkMessengerGateway`;
  - `engine / DialogModule` зависит от абстрактного порта `PreviewNotifier`, а его реализация `PreviewPublisher` находится в `engine / PreviewModule` (связывание выполняется в `AppModule`);
  - `engine / DispatcherModule` не зависит от `engine / HttpModule` — порядок запуска (`HttpRequestExecutor.recoverAfterRestart()` до `EventDispatcher.start()`) координируется в `apps/engine/src/app.module.ts` (`AppModule.onApplicationBootstrap()`).
  Вспомогательные файлы (`apps/api/src/config.ts`, `apps/api/src/common/`, `apps/engine/src/config.ts`, `apps/web/src/{app,components,i18n,lib}`) относятся к базовому слою соответствующих приложений или указаны в примечаниях; в `apps/engine` файл `config.ts` является частью `InfraModule`.

---

## Таблица модулей (исходные данные для диаграммы)

Слои сверху вниз:
1. **взаимодействие** — веб-интерфейс (`apps/web`), шлюзы Telegram и VK (`api / TelegramModule`, `api / VkModule`, `engine / MessengerModule`), исходящий HTTP-клиент (`engine / HttpModule`) и публикатор превью (`engine / PreviewModule`);
2. **бизнес-логика** — чистое ядро исполнения диалогов (`@chatbot/engine-core`), управление проектами, аутентификация, валидация, публикация, импорт/экспорт, превью (`apps/api`), исполнение диалогов и диспетчеризация событий (`engine / DialogModule`, `engine / DispatcherModule`);
3. **базовый** — разделяемые модели, хранилище БД, криптография, транспорт очереди, общие утилиты и инфраструктурные DI-обёртки (`packages/{model,db,vault,queue}`, `api / {Prisma,Vault,Queue}Module`, `api / common` (в т. ч. порт `MessengerAdminPort`), `engine / InfraModule`).

| № | Модуль | Путь | Слой | Назначение | Классы модели | Использует (по реальным импортам) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `web / API-клиент` | `apps/web/src/api` | взаимодействие | HTTP-клиент к REST API (`apps/api`) для авторизации, проектов, ботов, валидации и импорта/экспорта | *(клиентский транспорт `apps/web`)* | `@chatbot/model` |
| 2 | `web / Страницы аккаунта` | `apps/web/src/pages` | взаимодействие | Экраны входа, регистрации, списка/создания проектов и управления ботами (окружение, подключение Telegram, публикация) | `AccountUI` | `@chatbot/model`, `web / API-клиент` |
| 3 | `web / Редактор сценария` | `apps/web/src/editor` | взаимодействие | Визуальный холст (React Flow) слева направо, панель «Что дальше?», окно блока «Вход — Настройки — Выход» для всех 10 типов, конструктор условий, поля выражений с подсказками, отмена/повтор, панель проверки, тестовое окружение, экспорт/импорт JSON | `EditorUI` | `@chatbot/engine-core`, `@chatbot/model`, `web / API-клиент`, `web / Превью-чат` |
| 4 | `web / Превью-чат` | `apps/web/src/preview` | взаимодействие | Окно превью: чат по Socket.IO (`/api/socket.io`, `/preview`), подсветка текущего блока, панель переменных, системные сообщения, перезапуск и восстановление сеанса | `PreviewChatUI` | `@chatbot/model` |
| 5 | `api / TelegramModule` | `apps/api/src/telegram` | взаимодействие | Приём webhook Telegram и long polling (`TELEGRAM_POLLING=1`), преобразование обновлений в `ChatEvent`, управление webhook, проверка токена и клиент Telegram Bot API (`TELEGRAM_PROXY`), адаптер `TelegramAdminAdapter` порта `MessengerAdminPort` (`common/messenger-admin.port.ts`) | `MessengerGateway` (приём и управление) | `@chatbot/model`, `@chatbot/queue`, `@chatbot/vault`, `api / PrismaModule`, `api / QueueModule`, `api / common` |
| 6 | `api / VkModule` | `apps/api/src/vk` | взаимодействие | Приём событий VK: Callback API (`POST /webhook/vk/:botId`, подтверждение сервера и проверка секрета) и Bots Long Poll (`VK_POLLING`, `VK_API_BASE_URL`), преобразование обновлений VK в `ChatEvent`, клиент VK API, адаптер `VkAdminAdapter` порта `MessengerAdminPort` (проверка токена сообщества, подключение и отключение) | `MessengerGateway` (приём и управление VK) | `@chatbot/model`, `@chatbot/queue`, `@chatbot/vault`, `api / PrismaModule`, `api / QueueModule`, `api / common` |
| 7 | `engine / MessengerModule` | `apps/engine/src/messenger` | взаимодействие | `CompositeMessengerGateway` реализует порт `MessengerGateway` и маршрутизирует отправку сообщений, кнопок и системных сообщений по префиксу чата: `tg:` → `TelegramMessengerGateway` (grammY, `TELEGRAM_PROXY`), `vk:` → `VkMessengerGateway` (VK API, `VK_API_BASE_URL`, форматирование клавиатур) | `MessengerGateway` (отправка) | `@chatbot/db`, `@chatbot/engine-core`, `@chatbot/vault`, `engine / DialogModule`, `engine / InfraModule` |
| 8 | `engine / HttpModule` | `apps/engine/src/http` | взаимодействие | Исходящие HTTP-запросы с тайм-аутами, повторами (`undici` + `p-retry`) и фильтром `HTTP_ALLOWED_HOSTS`, возврат результата в очередь, разбор ответов, `ExternalApiHttpRequestLauncher` и `HttpRequestExecutor` (восстановление после перезапуска) | `ExternalApiClient`, `HttpRequestExecutor`, `ResponseParser` | `@chatbot/db`, `@chatbot/engine-core`, `@chatbot/model`, `@chatbot/queue`, `engine / DialogModule`, `engine / InfraModule` |
| 9 | `engine / PreviewModule` | `apps/engine/src/preview` | взаимодействие | Публикация событий `PreviewEvent` канала `PREVIEW` в Redis pub/sub `preview:<chatId>` (сообщения, текущий блок, переменные, системные сообщения); `PreviewPublisher` реализует порт `PreviewNotifier` | `PreviewPublisher` | `@chatbot/model`, `engine / DialogModule`, `engine / InfraModule` |
| 10 | `@chatbot/engine-core` | `packages/engine-core` | бизнес-логика | Чистое ядро диалогов без I/O: автопроход (лимит 100 шагов), безопасные выражения, шаблоны (1 проход), jsonPath, контекст в памяти | `DialogEngine` (ядро), `ExpressionEvaluator`, `DialogContext` (в памяти) | `@chatbot/model` |
| 11 | `api / AuthModule` | `apps/api/src/auth` | бизнес-логика | Регистрация, вход (argon2), выдача и проверка JWT-сессии в cookie (`JwtGuard`, `AuthService.authenticate`) | `AuthController` | `@chatbot/db`, `api / PrismaModule`, `api / common` |
| 12 | `api / ProjectModule` | `apps/api/src/projects` | бизнес-логика | CRUD проектов автора (список с `botsCount`, создание, чтение, переименование, каскадное удаление с отключением ботов от мессенджеров через порт `MessengerAdminPort`), валидация и сохранение сценария, шифрование секретных заголовков с санитизацией (`secretMask` вместо значений) и тестовое окружение проекта (через `EnvironmentService` из `common/`) | `ProjectController`, `ScenarioEditor` | `@chatbot/db`, `@chatbot/model`, `@chatbot/vault`, `api / AuthModule`, `api / PrismaModule`, `api / common` |
| 13 | `api / ValidatorModule` | `apps/api/src/validation` | бизнес-логика | Смысловая проверка графа сценария (`POST /api/projects/:projectId/validate`): ошибки (точка входа, выходы, поля, шаблоны, выражения, jsonPath) и 4 предупреждения (`WARNING`): циклы, недостижимые блоки, переменные без записи, не заданные переменные окружения | `ScenarioValidator`, `ValidationError` | `@chatbot/engine-core`, `@chatbot/model`, `api / AuthModule`, `api / PrismaModule` |
| 14 | `api / PublicationModule` | `apps/api/src/publication` | бизнес-логика | Управление ботами, рабочими окружениями с секретами (`EnvironmentService` из `common/`), проверка уникальности токена (`isTokenInUse`), подключение и отключение нескольких мессенджеров (Telegram и VK) через порт `MessengerAdminPort`, публикация и переопубликация со сбросом контекстов | `PublicationController` | `@chatbot/db`, `@chatbot/model`, `@chatbot/vault`, `api / AuthModule`, `api / PrismaModule`, `api / ValidatorModule`, `api / common` |
| 15 | `api / ImportExportModule` | `apps/api/src/import-export` | бизнес-логика | Экспорт (`GET /api/projects/:id/export?format=json` / `?format=yaml`, без значений секретных заголовков) и импорт (`POST /api/projects/:id/import?format=json` / `?format=yaml`, проверка схемой Zod, число секретов для заполнения) | `ImportExportController` | `@chatbot/model`, `api / AuthModule`, `api / ProjectModule`, `api / common` |
| 16 | `api / PreviewGateway` | `apps/api/src/preview` | бизнес-логика | Socket.IO-шлюз превью (путь `/api/socket.io`, пространство имён `/preview`): проверка сессии (JWT, с отключением сокета при истечении срока), запуск, ввод и перезапуск диалога через очередь; `PreviewSubscriber` читает Redis pub/sub `preview:<chatId>`; `PreviewCleanupService` удаляет просроченные контексты превью (TTL 24 ч) | `PreviewController` (реализован как шлюз) | `@chatbot/model`, `@chatbot/queue`, `api / AuthModule`, `api / PrismaModule`, `api / QueueModule` |
| 17 | `engine / DialogModule` | `apps/engine/src/dialog` | бизнес-логика | Транзакционная обработка событий диалога (`FOR UPDATE`), загрузка бота и окружения, провайдер `DialogEngine`, сохранение состояния, порты `MessengerGateway`, `HttpRequestLauncher` и `PreviewNotifier` | `DialogEngine` (I/O-слой `DialogService`), `DialogContext` (`ContextRepository`) | `@chatbot/db`, `@chatbot/engine-core`, `@chatbot/model`, `@chatbot/vault`, `engine / InfraModule` |
| 18 | `engine / DispatcherModule` | `apps/engine/src/dispatcher` | бизнес-логика | 16 воркеров BullMQ (`events-0..15`) и диспетчеризация событий в `DialogService` (восстановление незавершённых HTTP-запросов до запуска воркеров выполняется в `AppModule.onApplicationBootstrap()`) | `EventDispatcher` | `@chatbot/engine-core`, `@chatbot/model`, `@chatbot/queue`, `engine / DialogModule`, `engine / InfraModule` |
| 19 | `@chatbot/model` | `packages/model` | базовый | Формат сценария (`formatVersion: 1`), схемы Zod 10 типов блоков, выходы блоков, типы событий, окружений, секретов и типы ошибок | `Scenario`, `Block` (10 типов), `Transition`, `HttpHeader`, `ResponseMapping`, `Event`, `EventType`, `Channel`, `DialogState`, `EnvironmentVariable`, `EncryptedSecret` | *(нет)* |
| 20 | `@chatbot/db` | `packages/db` | базовый | Схема PostgreSQL, миграции Prisma, фабрика `createPrismaClient` и реэкспорт типов Prisma | `Author`, `Project`, `Bot`, `MessengerConnection`, `DialogContext` (БД), `Request` (`HttpRequest`) | *(нет)* |
| 21 | `@chatbot/vault` | `packages/vault` | базовый | Шифрование секретов AES-256-GCM с AAD (`tokenAad`, `envAad`, `headerAad`), маскирование (`SecretVault.mask`) и HMAC-SHA-256 хеширование токенов | `SecretVault` | `@chatbot/model` |
| 22 | `@chatbot/queue` | `packages/queue` | базовый | 16-раздельная очередь событий BullMQ над Redis, партиционирование FNV-1a, фабрика Redis-соединения | *(инфраструктура `EventDispatcher`)* | `@chatbot/model` |
| 23 | `api / PrismaModule` | `apps/api/src/prisma` | базовый | Глобальный провайдер `PrismaService` для работы с PostgreSQL в `apps/api` | *(инфраструктура БД)* | `@chatbot/db` |
| 24 | `api / VaultModule` | `apps/api/src/vault` | базовый | Глобальный DI-провайдер `SecretVault` в `apps/api` | `SecretVault` (DI) | `@chatbot/vault` |
| 25 | `api / QueueModule` | `apps/api/src/queue` | базовый | Глобальный DI-провайдер `EventQueue` (`EVENT_QUEUE`) в `apps/api` | *(инфраструктура очереди)* | `@chatbot/queue` |
| 26 | `engine / InfraModule` | `apps/engine/src/infra` | базовый | Глобальный DI-модуль `apps/engine`: конфигурация (`config.ts`), `PRISMA`, `EVENT_QUEUE`, `SecretVault` | *(инфраструктура `apps/engine`)* | `@chatbot/db`, `@chatbot/queue`, `@chatbot/vault` |
| 27 | `apps/mock-clinic` | `apps/mock-clinic/src` | внешняя система | Тестовый HTTP API записи к врачу (`node:http`, порт `4010`, брони в памяти); отдельное приложение, не импортирует код других модулей, сценарий обращается к нему HTTP-блоком | *(тестовая внешняя система)* | *(нет)* |

---

## Примечания для построения диаграммы

- **Инверсия зависимостей через порты в `apps/engine`:** абстрактные порты `MessengerGateway`, `HttpRequestLauncher` (и контракт `OutgoingHttpRequest`) и `PreviewNotifier` объявлены в слое бизнес-логики (`apps/engine/src/dialog/ports.ts`). Модули слоя взаимодействия (`engine / MessengerModule`, `engine / HttpModule`, `engine / PreviewModule`) импортируют эти порты сверху вниз и предоставляют конкретные адаптеры (`CompositeMessengerGateway` (с `TelegramMessengerGateway` и `VkMessengerGateway`), `ExternalApiHttpRequestLauncher`, `PreviewPublisher`). Связывание выполняется в точке композиции `apps/engine/src/app.module.ts` через `DialogModule.register({ imports: [MessengerModule, HttpModule, PreviewModule] })`. Там же `AppModule.onApplicationBootstrap()` вызывает `HttpRequestExecutor.recoverAfterRestart()` до `EventDispatcher.start()`, поэтому `DispatcherModule` не зависит от `HttpModule`.
- **Инверсия зависимостей и базовый каталог `common/` в `apps/api`:** абстрактный порт `MessengerAdminPort` и композитная реализация `CompositeMessengerAdminPort` объявлены в `apps/api/src/common/messenger-admin.port.ts`. Конкретные адаптеры — `TelegramAdminAdapter` (`apps/api/src/telegram/telegram-admin.adapter.ts`) и `VkAdminAdapter` (`apps/api/src/vk/vk-admin.adapter.ts`) — регистрируются под токенами `TELEGRAM_ADMIN_ADAPTER` и `VK_ADMIN_ADAPTER` и связываются в `apps/api/src/app.module.ts` через `ProjectModule.register({ imports: [TelegramModule, VkModule] })` и `PublicationModule.register({ imports: [TelegramModule, VkModule] })`. Общие сервисы и утилиты (`EnvironmentService`, `scenario-helpers`, `ZodBodyPipe`) также находятся в `common/` (зависит только от `@chatbot/model` и `@chatbot/vault`), благодаря чему `ProjectModule` и `PublicationModule` полностью изолированы друг от друга и от слоя взаимодействия.
- **Межпроцессные связи (не являются импортами кода):**
  - `apps/web` → `apps/api` — по HTTP (REST JSON + cookie-сессия);
  - `apps/api` → `apps/engine` — асинхронно через очередь событий BullMQ/Redis (`@chatbot/queue`, 16 разделов);
  - `apps/api` → `apps/web` — события превью по Socket.IO; `apps/engine` → `apps/api` — через Redis pub/sub `preview:<chatId>`;
  - `apps/engine` → `apps/mock-clinic` — HTTP-запросы блока (в production только хосты из `HTTP_ALLOWED_HOSTS`);
  - `apps/api` и `apps/engine` разделяют базу PostgreSQL (`@chatbot/db`).
- **Корневые модули сборки NestJS:** `apps/api/src/app.module.ts` и `apps/engine/src/app.module.ts` (а также `apps/web/src/App.tsx` и `routes.tsx`) являются точками композиции приложений и не выносятся отдельными прикладными модулями на диаграмму.
- **Глобальные DI-провайдеры:** `api / VaultModule` помечен `@Global()`, поэтому `api / ProjectModule`, `api / PublicationModule` и `api / TelegramModule` и `api / VkModule` внедряют `SecretVault` через токен класса из `@chatbot/vault` без прямого импорта `VaultModule`.
- **Вспомогательные каталоги `apps/web`:** `components/ui`, `app`, `i18n`, `lib` — общие UI-примитивы и локализация внутри фронтенда; в таблице показаны только прикладные области (`pages`, `editor`, `preview`) и клиент `api`.
