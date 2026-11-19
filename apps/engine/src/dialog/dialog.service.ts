import type { PrismaClient } from '@chatbot/db';
import { DialogEngine, type EngineResult, type OutgoingMessage } from '@chatbot/engine-core';
import { environmentSchema, scenarioSchema, type ChatEvent, type Scenario } from '@chatbot/model';
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
      const bot = await tx.bot.findUnique({ where: { id: botId } });
      if (!bot?.publishedScenario) {
        this.logger.warn(`Бот ${botId} не найден или не опубликован, событие пропущено`);
        return null;
      }
      const scenario: Scenario = scenarioSchema.parse(bot.publishedScenario);
      const env = buildEnvironment(botId, environmentSchema.parse(bot.environment), this.vault);

      const row = await this.repository.lockForUpdate(tx, botId, event.chatId);
      const result = this.engine.handleEvent(event, row ? toState(row) : null, scenario, env);

      const data = {
        userId: event.userId,
        channel: event.channel,
        state: result.context.state,
        currentBlockId: result.context.currentBlockId ?? '',
        variables: result.context.variables,
        currentRequestId: result.context.currentRequestId,
      };
      const saved = row
        ? await tx.dialogContext.update({ where: { id: row.id }, data })
        : await tx.dialogContext.create({ data: { ...data, botId, chatId: event.chatId } });

      let httpRequestId: string | null = null;
      if (result.httpRequest) {
        const request = result.httpRequest;
        // Расшифровка секретов — проверка в памяти до фиксации; в базу пишется маска
        decryptHeaders(request.headers, bot.projectId, this.vault);
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

  // Ошибка отправки одного сообщения не отменяет сохранённое состояние: пишется в журнал
  private async sendAll(botId: string, chatId: string, messages: OutgoingMessage[]): Promise<void> {
    for (const message of messages) {
      try {
        await this.gateway.sendMessage(botId, chatId, message);
      } catch (error) {
        this.logger.error(`Не удалось отправить сообщение боту ${botId}, чат ${chatId}`, error);
      }
    }
  }
}

function toState(row: DialogContextRow) {
  return {
    state: row.state,
    currentBlockId: row.currentBlockId === '' ? null : row.currentBlockId,
    variables: row.variables,
    currentRequestId: row.currentRequestId,
  };
}
