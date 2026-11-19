import type { Bot, Prisma, PrismaClient } from '@chatbot/db';
import { DialogEngine, type EngineResult, type OutgoingMessage } from '@chatbot/engine-core';
import {
  environmentSchema,
  NotImplementedError,
  scenarioSchema,
  type ChatEvent,
  type Scenario,
} from '@chatbot/model';
import { SecretVault } from '@chatbot/vault';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA } from '../infra/tokens';
import { HttpRequestLauncher } from '../http/http-request-launcher';
import { MessengerGateway } from '../messenger/messenger-gateway';
import { ContextRepository, type DialogContextRow } from './context.repository';
import { buildEnvironment } from './environment';
import { decryptHeaders, toStoredHeaders } from './http-headers';

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
      if (!bot?.publishedScenario) {
        this.logger.warn(`Бот ${botId} не найден или не опубликован, событие пропущено`);
        return null;
      }
      const scenario: Scenario = scenarioSchema.parse(bot.publishedScenario);
      const env = buildEnvironment(botId, environmentSchema.parse(bot.environment), this.vault);

      await this.repository.ensureExists(tx, botId, event.chatId, event.userId, event.channel);
      const row = await this.loadContext(tx, botId, event.chatId);
      if (!row) throw new Error('Контекст диалога не найден после создания');
      const result = this.engine.handleEvent(event, toState(row), scenario, env);

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
        // В базу пишется маска; секреты расшифровываются в памяти после фиксации
        const created = await tx.httpRequest.create({
          data: {
            dialogContextId: saved.id,
            blockId: request.blockId,
            method: request.method,
            url: request.url,
            headers: toStoredHeaders(request.headers) as object[],
            body: request.body ?? '',
            status: 'SENT',
          },
        });
        httpRequestId = created.id;
        await tx.dialogContext.update({
          where: { id: saved.id },
          data: { currentRequestId: created.id },
        });
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
