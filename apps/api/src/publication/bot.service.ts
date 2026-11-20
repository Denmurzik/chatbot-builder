import { Prisma } from '@chatbot/db';
import type { BotView, EnvVarInput, EnvVarView, EnvironmentVariable } from '@chatbot/model';
import { SecretVault, tokenAad } from '@chatbot/vault';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
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
    await this.prisma.client.$transaction(async (tx) => {
      // Сначала разрываем ссылки контекстов на запросы, затем удаляем зависимые записи
      await tx.dialogContext.updateMany({ where: { botId }, data: { currentRequestId: null } });
      await tx.httpRequest.deleteMany({ where: { dialogContext: { botId } } });
      await tx.dialogContext.deleteMany({ where: { botId } });
      await tx.messengerConnection.deleteMany({ where: { botId } });
      await tx.bot.delete({ where: { id: botId } });
    });
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
    await this.getOwnedBot(authorId, projectId, botId);
    const me = await this.verifier.verify(token);
    if (!me) {
      throw new BadRequestException('Токен недействителен');
    }
    const tokenHash = this.vault.hash(token);
    const other = await this.prisma.client.messengerConnection.findUnique({ where: { tokenHash } });
    if (other && other.botId !== botId) {
      throw new ConflictException('Токен уже используется другим ботом');
    }
    const { cipherText, mask } = this.vault.encrypt(token, tokenAad(botId));
    const data = { tokenCipher: cipherText, tokenMask: mask, tokenHash };
    try {
      await this.prisma.client.messengerConnection.upsert({
        where: { botId_messenger: { botId, messenger: 'TELEGRAM' } },
        create: { botId, messenger: 'TELEGRAM', ...data },
        update: data,
      });
    } catch (err) {
      // Гонка: тот же токен успели подключить другому боту
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Токен уже используется другим ботом');
      }
      throw err;
    }
    return { messenger: 'TELEGRAM', tokenMask: mask, botUsername: me.username };
  }

  async disconnectTelegram(authorId: string, projectId: string, botId: string): Promise<void> {
    await this.getOwnedBot(authorId, projectId, botId);
    await this.prisma.client.messengerConnection.deleteMany({
      where: { botId, messenger: 'TELEGRAM' },
    });
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
