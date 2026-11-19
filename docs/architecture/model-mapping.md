# Соответствие классов модели BCE коду монорепозитория

Документ фиксирует отображение всех граничных (boundary) и управляющих (control) классов диаграммы `VP-chatbot/class-diagrams/Классы - BCE.png` (а также основных сущностей и блоков сценария) на реальные файлы кода и модули NestJS / React.

## Граничные и управляющие классы (BCE)

| Класс модели | Файл(ы) | Статус | Комментарий |
| --- | --- | --- | --- |
| `AccountUI` | `apps/web/src/pages/LoginPage.tsx`, `RegisterPage.tsx`, `AuthForm.tsx`, `ProjectsPage.tsx` | частично | Регистрация, вход, список и создание проектов реализованы (спринт 1); переименование/удаление проектов и импорт — после спринта 1 |
| `EditorUI` | `apps/web/src/editor/EditorPage.tsx`, `Canvas.tsx`, `Palette.tsx`, `Inspector.tsx`, `BlockNode.tsx` | частично | Холст, 10 типов блоков, переходы и сохранение (спринт 1); полные формы, окружения, проверка и публикация — спринты 2–3 |
| `PreviewChatUI` | `apps/web/src/preview/PreviewChatUI.tsx` | заглушка | Заглушка компонента («Превью появится в спринте 3») и хук `usePreviewChat()` с операциями модели (`NotImplementedError`); маршрут не подключён (спринт 3) |
| `MessengerGateway` | `apps/api/src/telegram/messenger-gateway.controller.ts`, `apps/api/src/telegram/update-ingest.service.ts` (приём); `apps/engine/src/messenger/messenger-gateway.ts` (отправка и управление) | частично | Разделён между приложениями: `api` принимает webhook (`receiveUpdate`) и кладёт событие в очередь; `engine` отправляет сообщения (`sendMessage`, `sendMessages`). Операции `sendQuestion`, `verifyToken`, `connectBot`, `disconnectBot` — заглушки (спринты 2–3) |
| `ExternalApiClient` | `apps/engine/src/http/external-api-client.ts`, `apps/engine/src/http/queue-http-result-sink.ts` | частично | `send`, `onResponse`, `onFailure` (через `HttpResultSink`) реализованы в спринте 1; `findSentRequest` — заглушка (спринт 2) |
| `AuthController` | `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts` | реализован | Реализован парой `AuthController` (HTTP-слой, cookie) + `AuthService` (`register`, `login`, `findAuthorByEmail`, `hashPassword`, `verifyPassword`) |
| `ProjectController` | `apps/api/src/projects/project.controller.ts`, `apps/api/src/projects/project.service.ts` | частично | `listProjects`, `createProject`, `getById`, `saveScenario` реализованы в спринте 1; `renameProject`, `deleteProject` — заглушки (после MVP) |
| `ScenarioEditor` | `apps/api/src/projects/scenario-editor.ts` | частично | `validateScenario` и `saveScenario` реализованы (сценарий редактируется на клиенте и сохраняется целиком); операции `addBlock`, `updateBlockSettings`, `deleteBlock`, `connect`, `deleteTransition` — заглушки |
| `ScenarioValidator` | `apps/api/src/validation/scenario-validator.ts`, `apps/api/src/validation/validator.module.ts` | заглушка | Все 7 операций модели (`validate`, `checkSingleEntryPoint`, `checkOutputsConnected`, `checkRequiredFields`, `checkConnections`, `checkBlockFields`, `checkLoops`) и тип `ValidationError` (спринт 2) |
| `PublicationController` | `apps/api/src/publication/publication.controller.ts`, `apps/api/src/publication/publication.module.ts` | заглушка | Операции `createBot`, `setEnvironment`, `connectMessenger`, `publish`, `republish`, `isTokenInUse`; DI: `PrismaService`, `EVENT_QUEUE`, `ScenarioValidator`, `SecretVault` (`VaultModule`), `ProjectService` (спринты 2–3) |
| `ImportExportController` | `apps/api/src/import-export/import-export.controller.ts`, `apps/api/src/import-export/import-export.module.ts` | заглушка | Операции `exportScenario`, `importScenario`, `serialize`, `checkStructure`, `deserialize`; DI: `PrismaService`, `ProjectService`, `ScenarioEditor`, `ScenarioValidator` (спринт 3) |
| `PreviewController` | `apps/api/src/preview/preview.controller.ts`, `apps/api/src/preview/preview.module.ts` | заглушка | Операции `startPreview`, `sendInput`, `restartPreview`, `stopAtUnconnectedOutput` без Socket.IO-шлюза (шлюз — спринт 3); DI: `PrismaService`, `EVENT_QUEUE`, `ProjectService` |
| `PreviewPublisher` | `apps/engine/src/preview/preview-publisher.ts`, `apps/engine/src/preview/preview.module.ts` | заглушка | Вспомогательный компонент канала PREVIEW на стороне `engine` для публикации событий в Redis (`publishMessage`, `publishCurrentBlock`, `publishVariables`, `publishSystemMessage`; спринт 2) |
| `EventDispatcher` | `apps/engine/src/dispatcher/event-dispatcher.ts`, `apps/engine/src/dispatcher/dispatcher.module.ts` | частично | 16 воркеров BullMQ и `enqueue` реализованы в спринте 1; `isStale`, `broadcast`, `takeNext` — заглушки (спринты 2–3) |
| `DialogEngine` | `packages/engine-core/src/dialog-engine.ts` (чистая логика), `apps/engine/src/dialog/dialog.service.ts` (I/O) | частично | Разделён на чистое ядро (`handleEvent`, `startDialog`, `restartDialog`, `runAutopass`, `executeBlock`, `followOutput`, `finishDialog`, `matchButton`) и I/O-слой `DialogService` (`loadContext` → `ContextRepository`, `findBot` → Prisma, заглушки `findContexts`, `resetDialogs`) |
| `ExpressionEvaluator` | `packages/engine-core/src/expression-evaluator.ts` | реализован | Реализованы `evaluate`, `evaluateCondition`, `evaluateExpression`, `extractVariableNames`, `substitute` |
| `HttpRequestExecutor` | `apps/engine/src/http/http-request-executor.ts`, `apps/engine/src/http/http.module.ts` | заглушка | Операции `createAndSend`, `handleResponse`, `handleFailure`, `resend`, `resume`, `recoverAfterRestart`; принимает `ctxId` вместо объекта `DialogContext` (контекст загружается внутри из БД); DI: `PRISMA`, `EVENT_QUEUE`, `ExternalApiClient`, `ResponseParser`, `SecretVault` (спринт 2) |
| `ResponseParser` | `apps/engine/src/http/response-parser.ts` | реализован | `parse`, `extract`, `toText` делегируют `@chatbot/engine-core` (спринт 1 / интеграция в спринте 2) |
| `SecretVault` | `packages/vault/src/secret-vault.ts`, `apps/api/src/vault/vault.module.ts` | частично | `encrypt`, `decrypt`, `hash` реализованы в спринте 1; `mask` — заглушка; в `api` предоставляется глобальным `VaultModule` |

## Основные сущности и типы модели

| Сущность / тип модели | Файл(ы) | Статус | Комментарий |
| --- | --- | --- | --- |
| `Scenario`, `Block` (10 типов), `Transition`, `HttpHeader`, `ResponseMapping` | `packages/model/src/{scenario,blocks,outputs}.ts` | реализован | Схемы Zod, `parseScenario`, `getOutputs`, `emptyScenario` |
| `Event`, `EventType`, `Channel`, `DialogState` | `packages/model/src/events.ts` | реализован | Общие типы событий и состояний диалога |
| `EnvironmentVariable`, `EncryptedSecret` | `packages/model/src/environment.ts` | реализован | Окружения проекта и бота, структура зашифрованного секрета |
| `DialogContext` | `packages/engine-core/src/dialog-context.ts`, `apps/engine/src/dialog/context.repository.ts` | реализован | Объект в памяти для ядра + блокирующее чтение `FOR UPDATE` в PostgreSQL |
| `ValidationError` | `apps/api/src/validation/scenario-validator.ts` | реализован | Интерфейс результата проверки (`rule`, `message`, `severity`, `blockId`) |
| `Author`, `Project`, `Bot`, `MessengerConnection`, `DialogContext`, `Request` | `packages/db/prisma/schema.prisma` | реализован | Таблицы PostgreSQL и миграции Prisma |
