import { Prisma } from '@chatbot/db';
import type {
  BotView,
  EnvVarInput,
  EnvVarView,
  EnvironmentVariable,
  Scenario,
  ValidationError,
} from '@chatbot/model';
import { SecretVault, tokenAad } from '@chatbot/vault';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { TelegramWebhookService } from '../telegram/telegram-webhook.service';
import { ScenarioValidator } from '../validation/scenario-validator';
import { EnvironmentService } from './environment.service';
import { TelegramTokenVerifier } from './telegram-token.verifier';

type BotWithConnections = Prisma.BotGetPayload<{ include: { connections: true } }>;

// Сервис ботов проекта, их окружений и подключения Telegram (п. 2.11, 2.12)
@Injectable()
export class BotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SecretVault,
    private readonly environments: EnvironmentService,
    private readonly verifier: TelegramTokenVerifier,
    private readonly validator: ScenarioValidator,
    private readonly telegram: TelegramWebhookService,
  ) {}

  async list(authorId: string, projectId: string): Promise<BotView[]> {
    await this.assertProject(authorId, projectId);
    const bots = await this.prisma.client.bot.findMany({
      where: { projectId },
      include: { connections: true },
      orderBy: { name: 'asc' },
    });
    return bots.map((b) => this.toView(b));
  }

  async create(authorId: string, projectId: string, name: string): Promise<BotView> {
    await this.assertProject(authorId, projectId);
    const bot = await this.prisma.client.bot.create({
      data: { projectId, name, environment: [] },
      include: { connections: true },
    });
    return this.toView(bot);
  }

  async remove(authorId: string, projectId: string, botId: string): Promise<void> {
    await this.getOwnedBot(authorId, projectId, botId);
    const oldToken = await this.currentToken(botId);
    await this.prisma.client.$transaction(async (tx) => {
      // Сначала разрываем ссылки контекстов на запросы, затем удаляем зависимые записи
      await tx.dialogContext.updateMany({ where: { botId }, data: { currentRequestId: null } });
      await tx.httpRequest.deleteMany({ where: { dialogContext: { botId } } });
      await tx.dialogContext.deleteMany({ where: { botId } });
      await tx.messengerConnection.deleteMany({ where: { botId } });
      await tx.bot.delete({ where: { id: botId } });
    });
    if (oldToken) await this.telegram.disconnect(botId, oldToken);
  }

  async setEnvironment(
    authorId: string,
    projectId: string,
    botId: string,
    input: EnvVarInput[],
  ): Promise<EnvVarView[]> {
    const bot = await this.getOwnedBot(authorId, projectId, botId);
    const merged = this.environments.merge(
      botId,
      bot.environment as unknown as EnvironmentVariable[],
      input,
    );
    await this.prisma.client.bot.update({
      where: { id: botId },
      data: { environment: merged as unknown as Prisma.InputJsonValue },
    });
    return this.environments.toView(merged);
  }

  async connectTelegram(
    authorId: string,
    projectId: string,
    botId: string,
    token: string,
  ): Promise<{ messenger: 'TELEGRAM'; tokenMask: string; botUsername: string }> {
    const bot = await this.getOwnedBot(authorId, projectId, botId);
    const me = await this.verifier.verify(token);
    if (!me) {
      throw new BadRequestException('Токен недействителен');
    }
    const tokenHash = this.vault.hash(token);
    const other = await this.prisma.client.messengerConnection.findUnique({ where: { tokenHash } });
    if (other && other.botId !== botId) {
      throw new ConflictException('Токен уже используется другим ботом');
    }
    const oldToken = await this.currentToken(botId);
    // Опубликованный бот сразу переключается на новый токен (до сохранения: ошибка Telegram -> 502)
    const published = bot.status === 'PUBLISHED';
    if (published) await this.telegram.connect(botId, token);
    const { cipherText, mask } = this.vault.encrypt(token, tokenAad(botId));
    const data = { tokenCipher: cipherText, tokenMask: mask, tokenHash };
    try {
      await this.saveConnection(botId, data);
    } catch (err) {
      if (published && oldToken !== token) {
        // Откатываем подключение нового токена, возвращаем прежний
        await this.telegram.disconnect(botId, token);
        if (oldToken) await this.telegram.connect(botId, oldToken).catch(() => undefined);
      }
      throw err;
    }
    if (published && oldToken && oldToken !== token) {
      await this.telegram.disconnect(botId, oldToken);
    }
    return { messenger: 'TELEGRAM', tokenMask: mask, botUsername: me.username };
  }

  async disconnectTelegram(authorId: string, projectId: string, botId: string): Promise<void> {
    await this.getOwnedBot(authorId, projectId, botId);
    const oldToken = await this.currentToken(botId);
    await this.prisma.client.messengerConnection.deleteMany({
      where: { botId, messenger: 'TELEGRAM' },
    });
    if (oldToken) await this.telegram.disconnect(botId, oldToken);
  }

  // Публикация и переопубликация (п. 2.11): проверка -> подключение к Telegram -> фиксация сценария
  async publish(
    authorId: string,
    projectId: string,
    botId: string,
  ): Promise<{ bot: BotView; warnings: ValidationError[] }> {
    await this.getOwnedBot(authorId, projectId, botId);
    const project = await this.prisma.client.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { scenario: true },
    });
    const scenario = project.scenario as unknown as Scenario;
    const issues = [
      ...this.validator.validate(scenario),
      ...(await this.validator.checkConnections(botId)),
    ];
    if (issues.some((i) => i.severity === 'ERROR')) {
      throw new UnprocessableEntityException({ errors: issues });
    }
    const warnings = issues.filter((i) => i.severity === 'WARNING');

    const token = await this.currentToken(botId);
    if (!token) {
      throw new UnprocessableEntityException({
        errors: [
          {
            rule: 'connections',
            severity: 'ERROR',
            message: 'У бота нет подключения к мессенджеру',
          },
        ],
      });
    }
    // Вне транзакции: ошибка Telegram даёт 502, и бот не меняется
    await this.telegram.connect(botId, token);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      // Статус читаем внутри транзакции: параллельные публикации тоже сбрасывают контексты
      const current = await tx.bot.findUniqueOrThrow({
        where: { id: botId },
        select: { status: true },
      });
      const wasPublished = current.status === 'PUBLISHED';
      const result = await tx.bot.update({
        where: { id: botId },
        data: {
          publishedScenario: structuredClone(scenario) as unknown as Prisma.InputJsonValue,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
        include: { connections: true },
      });
      if (wasPublished) {
        // Новая версия сценария: прежние диалоги завершаются, следующее сообщение начнёт с начала
        await tx.dialogContext.updateMany({
          where: { botId },
          data: {
            state: 'FINISHED',
            currentBlockId: null,
            variables: {},
            currentRequestId: null,
          },
        });
      }
      return result;
    });
    return { bot: this.toView(updated), warnings };
  }

  private async currentToken(botId: string): Promise<string | null> {
    const connection = await this.prisma.client.messengerConnection.findUnique({
      where: { botId_messenger: { botId, messenger: 'TELEGRAM' } },
    });
    if (!connection) return null;
    return this.vault.decrypt(
      { cipherText: connection.tokenCipher, mask: connection.tokenMask },
      tokenAad(botId),
    );
  }

  // Запись подключения; P2002 по token_hash — токен занят другим ботом, иная гонка (botId_messenger) — повтор
  private async saveConnection(
    botId: string,
    data: { tokenCipher: string; tokenMask: string; tokenHash: string },
  ): Promise<void> {
    const attempt = async (): Promise<'ok' | 'retry'> => {
      try {
        await this.prisma.client.messengerConnection.upsert({
          where: { botId_messenger: { botId, messenger: 'TELEGRAM' } },
          create: { botId, messenger: 'TELEGRAM', ...data },
          update: data,
        });
        return 'ok';
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
          throw err;
        }
        if (String(err.meta?.target ?? '').includes('token_hash')) {
          throw new ConflictException('Токен уже используется другим ботом');
        }
        return 'retry';
      }
    };
    if ((await attempt()) === 'retry') await attempt();
  }

  private async assertProject(authorId: string, projectId: string): Promise<void> {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, authorId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Проект не найден');
    }
  }

  private async getOwnedBot(authorId: string, projectId: string, botId: string) {
    const bot = await this.prisma.client.bot.findFirst({
      where: { id: botId, projectId, project: { authorId } },
    });
    if (!bot) {
      throw new NotFoundException('Бот не найден');
    }
    return bot;
  }

  private toView(bot: BotWithConnections): BotView {
    return {
      id: bot.id,
      name: bot.name,
      status: bot.status,
      publishedAt: bot.publishedAt ? bot.publishedAt.toISOString() : null,
      connections: bot.connections.map((c) => ({ messenger: 'TELEGRAM', tokenMask: c.tokenMask })),
      environment: this.environments.toView(bot.environment as unknown as EnvironmentVariable[]),
    };
  }
}
