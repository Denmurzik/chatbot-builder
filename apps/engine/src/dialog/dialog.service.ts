import type { Bot, Prisma, PrismaClient } from '@chatbot/db';
import {
  DialogEngine,
  type EngineResult,
  type HttpOutcome,
  type OutgoingMessage,
} from '@chatbot/engine-core';
import {
  environmentSchema,
  NotImplementedError,
  scenarioSchema,
  type ChatEvent,
  type Environment,
  type Scenario,
} from '@chatbot/model';
import { SecretVault } from '@chatbot/vault';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA } from '../infra/tokens';
import { ContextRepository, type DialogContextRow } from './context.repository';
import { buildEnvironment } from './environment';
import { decryptHeaders, toStoredHeaders } from './http-headers';
import { HttpRequestLauncher, MessengerGateway } from './ports';

interface Processed {
  result: EngineResult;
  contextId: string;
  httpRequestId: string | null;
  projectId: string;
}

// Обработка одного события диалога по п. 2.2: транзакция с блокировкой контекста,
// отправка сообщений только после фиксации
@Injectable()
export class DialogService {
  private readonly logger = new Logger(DialogService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly vault: SecretVault,
    private readonly engine: DialogEngine,
    private readonly repository: ContextRepository,
    private readonly gateway: MessengerGateway,
    private readonly launcher: HttpRequestLauncher,
  ) {}

  async process(event: ChatEvent): Promise<void> {
    if (event.botId === null) {
      // Канал превью обслуживается в спринте 2
      this.logger.warn(`Событие превью пропущено: chatId=${event.chatId}`);
      return;
    }
    const botId = event.botId;

    const processed = await this.prisma.$transaction(async (tx): Promise<Processed | null> => {
      const bot = await this.findBot(botId, tx);
      if (!bot || bot.status !== 'PUBLISHED' || !bot.publishedScenario) {
        this.logger.warn(`Бот ${botId} не найден или не опубликован, событие пропущено`);
        return null;
      }
      const scenario: Scenario = scenarioSchema.parse(bot.publishedScenario);
      const envVars = environmentSchema.parse(bot.environment);
      const env = buildEnvironment(botId, envVars, this.vault);
      const secretMasks = collectSecretMasks(envVars, env);

      await this.repository.ensureExists(tx, botId, event.chatId, event.userId, event.channel);
      const row = await this.loadContext(tx, botId, event.chatId);
      if (!row) throw new Error('Контекст диалога не найден после создания');

      let outcome: HttpOutcome | undefined;
      if (event.type === 'RESPONSE_RECEIVED' || event.type === 'REQUEST_FAILED') {
        const httpReq = event.requestId
          ? await tx.httpRequest.findUnique({ where: { id: event.requestId } })
          : null;
        if (httpReq) {
          outcome =
            event.type === 'RESPONSE_RECEIVED'
              ? {
                  kind: 'response',
                  status: httpReq.responseCode ?? 200,
                  body: httpReq.responseBody ?? '',
                }
              : {
                  kind: 'failure',
                  code: httpReq.responseCode ?? 0,
                  message: httpReq.error ?? 'Не удалось выполнить запрос',
                };
        }
      }

      const result = this.engine.handleEvent(event, toState(row), scenario, env, outcome);
      if (result.stale) {
        this.logger.log(
          `ответ отброшен: botId=${botId}, chatId=${event.chatId}, requestId=${event.requestId ?? 'null'}`,
        );
        return null;
      }

      const data = {
        userId: event.userId,
        channel: event.channel,
        state: result.context.state,
        currentBlockId: result.context.currentBlockId,
        variables: result.context.variables,
        currentRequestId: result.context.currentRequestId,
      };
      const saved = await tx.dialogContext.update({ where: { id: row.id }, data });

      let httpRequestId: string | null = null;
      if (result.httpRequest) {
        const request = result.httpRequest;
        // В базу пишутся маски вместо секретных заголовков и секретных переменных окружения (п. 2.13)
        const storedUrl = maskSecrets(request.url, secretMasks, 'URL');
        const storedHeaders = toStoredHeaders(request.headers).map((h) =>
          h.secret ? h : { ...h, value: maskSecrets(h.value, secretMasks, 'HEADER') },
        );
        const storedBody = maskSecrets(request.body ?? '', secretMasks, 'JSON');

        if (result.resumeRequestId) {
          const updated = await tx.httpRequest.update({
            where: { id: result.resumeRequestId },
            data: {
              method: request.method,
              url: storedUrl,
              headers: storedHeaders as object[],
              body: storedBody,
              status: 'SENT',
              attempt: { increment: 1 },
              responseCode: null,
              responseBody: null,
              error: null,
            },
          });
          httpRequestId = updated.id;
        } else {
          const created = await tx.httpRequest.create({
            data: {
              dialogContextId: saved.id,
              blockId: request.blockId,
              method: request.method,
              url: storedUrl,
              headers: storedHeaders as object[],
              body: storedBody,
              status: 'SENT',
            },
          });
          httpRequestId = created.id;
          await tx.dialogContext.update({
            where: { id: saved.id },
            data: { currentRequestId: created.id },
          });
        }
      }
      return { result, contextId: saved.id, httpRequestId, projectId: bot.projectId };
    });
    if (!processed) return;

    // После фиксации: сообщения пользователю, затем запуск HTTP-запроса
    await this.sendAll(botId, event.chatId, processed.result.outbox);
    if (processed.result.httpRequest && processed.httpRequestId) {
      const request = processed.result.httpRequest;
      this.launcher.launch(
        {
          id: processed.httpRequestId,
          method: request.method,
          url: request.url,
          headers: decryptHeaders(request.headers, processed.projectId, this.vault),
          body: request.body,
        },
        request,
      );
    }
  }

  // Загружает контекст диалога с блокировкой строки (операция DialogEngine.loadContext, I/O-часть)
  loadContext(
    tx: Prisma.TransactionClient,
    botId: string | null,
    chatId: string,
  ): Promise<DialogContextRow | null> {
    return this.repository.lockForUpdate(tx, botId, chatId);
  }

  // Находит бота по идентификатору (операция DialogEngine.findBot, I/O-часть)
  findBot(botId: string, tx?: Prisma.TransactionClient): Promise<Bot | null> {
    return (tx ?? this.prisma).bot.findUnique({ where: { id: botId } });
  }

  // Возвращает все активные контексты бота (операция DialogEngine.findContexts, SD-6, спринт 3)
  findContexts(_botId: string): Promise<DialogContextRow[]> {
    throw new NotImplementedError('DialogService.findContexts');
  }

  // Сбрасывает все контексты бота при переопубликации (операция DialogEngine.resetDialogs, UC-U-07, SD-6, спринт 3)
  resetDialogs(_botId: string): Promise<void> {
    throw new NotImplementedError('DialogService.resetDialogs');
  }

  // Ошибка отправки не отменяет сохранённое состояние: пишется в журнал
  private async sendAll(botId: string, chatId: string, messages: OutgoingMessage[]): Promise<void> {
    try {
      await this.gateway.sendMessages(botId, chatId, messages);
    } catch (error) {
      this.logger.error(`Не удалось отправить сообщения боту ${botId}, чат ${chatId}`, error);
    }
  }
}

function toState(row: DialogContextRow) {
  return {
    state: row.state,
    currentBlockId: row.currentBlockId,
    variables: row.variables,
    currentRequestId: row.currentRequestId,
  };
}

interface SecretMask {
  value: string;
  mask: string;
}

// Собирает пары (расшифрованное значение, маска) для секретных переменных окружения
function collectSecretMasks(variables: Environment, env: Record<string, string>): SecretMask[] {
  const masks: SecretMask[] = [];
  for (const variable of variables) {
    if (!variable.secret || !variable.secretValue) continue;
    const value = env[variable.name];
    if (value) masks.push({ value, mask: variable.secretValue.mask });
  }
  // Более длинные секреты заменяем первыми, чтобы короткий не разбил длинный
  masks.sort((a, b) => b.value.length - a.value.length);
  return masks;
}

// Заменяет значения секретных переменных окружения их маской перед записью в http_request
function maskSecrets(text: string, masks: SecretMask[], mode: 'URL' | 'HEADER' | 'JSON'): string {
  let out = text;
  for (const { value, mask } of masks) {
    const rendered =
      mode === 'HEADER'
        ? value.replace(/[\r\n]+/g, '')
        : mode === 'JSON'
          ? JSON.stringify(value).slice(1, -1)
          : value;
    if (rendered) out = out.replaceAll(rendered, mask);
    if (rendered !== value) out = out.replaceAll(value, mask);
  }
  return out;
}
