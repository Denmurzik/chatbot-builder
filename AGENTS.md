# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это за папка

Учебный проект по системному анализу: команда делает «Конструктор чат-ботов» (веб-редактор сценария из блоков, превью, публикация бота в Telegram, движок диалогов с HTTP-запросами). Здесь и модель в Visual Paradigm с документами для куратора, и код приложения (монорепозиторий pnpm). Общение с пользователем — на русском.

Репозиторий GitHub `Denmurzik/chatbot-builder`: работа в ветках, слияние через PR после зелёного CI (`.github/workflows`). Планы спринтов — `docs/superpowers/plans/`, описание модулей — `docs/architecture/`. Подпапка `vp-mcp/` — отдельный git-репозиторий MCP-плагина для VP со своим `CLAUDE.md` и `PROJECT_STATUS.md`.

## Ключевые артефакты

- `VP-chatbot/chatbot.vpp` — единственная актуальная модель (UC, классы BCE и блоков, SD-1…SD-20, ER «Модель данных (PostgreSQL)»). `.bak_*` рядом — автоматические и ручные бэкапы, не трогать.
- `VP-chatbot/{uc,class,sequence,design}-diagrams/` — PNG-выгрузки диаграмм; после изменения диаграммы выгрузку обновлять.
- `VP-chatbot/Use cases.pdf` — документ use cases (русский, имена UC «рус. глагольное (English)», трассировка UC → SD). Отдельный docx не делать.
- `VP-chatbot/stack-and-plan.md` и `Стек и решения.docx` — выбор стека, алгоритмы, модель данных, план спринтов. Это две версии одного документа: при правке одной сообщать, что вторая не синхронизирована.
- Источники требований: `Vision_чат-бот_конструктор.docx`, `SD_lec02_UML.pdf` (нотация, шаблон описания UC), `встречи с куратором/`.

## Работа с моделью Visual Paradigm

- Моделирование — только через MCP `visual-paradigm` (`http://127.0.0.1:8931/mcp`) и скилл `.claude/skills/visual-paradigm`. Сервер работает только при запущенной VP CE 18.1; при ECONNREFUSED запустить:
  `cmd //c start "" "C:\Program Files\Visual Paradigm CE 18.1\bin\Visual Paradigm.exe"` и дождаться порта.
- Скрипты изменений модели (тонкий Python-клиент к MCP) класть в scratchpad и всегда закрывать `if __name__ == "__main__"` — повторный импорт повторяет все изменения.
- Перед `vp_export_diagram_image` — `vp_open_diagram`. Перед сохранением — `vp_list_dialogs` пуст; после — в `.vpp` (SQLite) нет таблиц `LAST_*`.
- Sequence-диаграммы проще пересобрать `vp_build_sequence`, удалив сначала их модельные элементы (Message, CombinedFragment, InteractionOperand, Activation, LifeLine, Actor, Frame).
- Эксперименты с плагином — в отдельном проекте, не в `chatbot.vpp`.
- 6 UC (UC-A-24…28, UC-U-07) выпали из списка детей System: `vp_find_elements` их не видит, id брать из таблицы `MODEL_ELEMENT` в SQLite `.vpp`.

## Конвенции модели

- Use case модель — на английском: имя `UC-A-01. Register account` (код + глагол). Описание в Documentation по образцу Worchestra (Actor / Goal / Trigger condition / Preconditions / Main success scenario / Alternative scenarios «At step N, …» / Postconditions, термины-классы подчёркнуты); писать оба поля сразу: `{"documentation": <plain>, "HTMLDocumentation": <html>}`.
- Классы и sequence: имена классов и методов на английском; описания, guard-условия и названия диаграмм — на русском.
- В sequence у каждого аргумента должен быть видимый источник (ответ предыдущего вызова или объект на диаграмме).
- Диаграммы обязаны читаться: после каждого изменения выгрузить PNG и посмотреть (нет линий сквозь фигуры и наложений подписей); неустранимые пересечения прямо называть в отчёте.
- Имена ответственных в плане не выдумывать — известен только лид.

## Плагин vp-mcp

- Сборка через `./run` из `vp-mcp/` (Maven не в PATH): `MVN=/c/Users/murue/tools/apache-maven-3.9.9/bin/mvn ./run test`; один тест — `... ./run test -Dtest=ИмяКласса`; `./run all` собирает и устанавливает плагин в `%APPDATA%\VisualParadigm\plugins` (VP перед этим закрыть — она держит jar). Лог: `%APPDATA%\VisualParadigm\vp.log`, строки `[vp-mcp]`.
- Плагин — Java 11 без runtime-зависимостей и без `jdk.httpserver`.
- Исправления плагина обычно делает отдельная Claude-сессия «VPmcp» — баг-репорты ей через SendMessage.
- Меняя скилл `vp-mcp/skills/visual-paradigm/`, ту же правку вносить в копию `.claude/skills/visual-paradigm/` (SKILL.md и `references/`), обе должны совпадать.

## Код приложения

- Пакеты: `packages/model` (Zod-схема сценария, блоков, событий — общий формат для всех), `engine-core` (DialogEngine, выражения на `jsep` без `eval`, шаблоны, jsonPath), `vault` (AES-256-GCM), `db` (Prisma), `queue` (BullMQ, 16 разделов по ключу диалога). Приложения: `apps/api` (NestJS, REST + приём Telegram), `apps/engine` (NestJS, воркеры очереди, HTTP-клиент), `apps/web` (React 18 + Vite + React Flow, shadcn/ui + Tailwind v4, CodeMirror 6). Таблица модулей и правила слоёв — `docs/architecture/modules.md`, класс модели → файл — `model-mapping.md`.
- Нереализованные методы классов модели бросают `NotImplementedError` (каркас с сигнатурами).
- pnpm из Git Bash вызывать через `pwsh -NoProfile -Command "pnpm …"` (шим nvm4w ломается в bash).
- Команды (подробно — `README.md`): `pnpm infra:up` (PostgreSQL :55432, Redis :56379), `pnpm --filter @chatbot/db db:migrate`, `pnpm --filter @chatbot/api seed:dev` (вход `dev@example.com` / `devpassword`), `pnpm dev:api|dev:engine|dev:web`; проверки — `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm arch` (dependency-cruiser: слои и отсутствие циклов). Один файл тестов: `pnpm exec vitest run путь/к/файлу.test.ts`.
- Dev api/engine запускаются как `tsc -b && node dist/main.js`: под tsx ломаются DI-декораторы NestJS.
- Полный `pnpm test` параллельно с dev-серверами может упасть по памяти воркеров vitest — проверять свободную RAM или гонять по проектам (`--project web`).
- `.env` (в git не попадает) — хосты `127.0.0.1`, а не `localhost` (Prisma). Long polling Telegram только при `TELEGRAM_POLLING=1`, в production запрещён.
- Строки интерфейса — в `apps/web/src/i18n/ru.ts`; комментарии и сообщения коммитов — на русском, без приписок Co-Authored-By.
- `.gitignore` — белый список: новый файл или папку в корне явно разрешать (`!/путь`).
- Для UI подключены MCP `shadcn` (`.mcp.json`) и скилл `.claude/skills/shadcn` (`apps/web/components.json`).
