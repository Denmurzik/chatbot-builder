import type { MessengerType } from '@chatbot/db';
import {
  envVarInputListSchema,
  NotImplementedError,
  type BotView,
  type EnvVarInput,
  type EnvVarView,
} from '@chatbot/model';
import type { EventQueue } from '@chatbot/queue';
import { SecretVault } from '@chatbot/vault';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { type AuthenticatedAuthor, CurrentAuthor } from '../auth/current-author.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { PrismaService } from '../prisma/prisma.module';
import { ProjectService } from '../projects/project.service';
import { EVENT_QUEUE } from '../queue/queue.module';
import { ScenarioValidator, type ValidationError } from '../validation/scenario-validator';
import { BotService } from './bot.service';
import {
  connectTelegramBodySchema,
  createBotBodySchema,
  type ConnectTelegramBody,
  type CreateBotBody,
} from './dto';

/**
 * Класс модели BCE: PublicationController — управление ботами, окружениями, подключением мессенджеров и публикацией.
 * Реализует UC-A-25…A-28, UC-A-32, UC-U-07, SD-6; спринт 2 (боты, окружения, подключение Telegram) и спринт 3 (публикация и переопубликация).
 */
@Controller('projects/:projectId/bots')
@UseGuards(JwtGuard)
export class PublicationController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_QUEUE) private readonly eventQueue: EventQueue,
    private readonly validator: ScenarioValidator,
    private readonly vault: SecretVault,
    private readonly projectService: ProjectService,
    private readonly bots: BotService,
  ) {
    // Зависимости спринта 3 (публикация), пока не используются
    void this.prisma;
    void this.eventQueue;
    void this.validator;
    void this.vault;
    void this.projectService;
  }

  @Get()
  listBots(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('projectId') projectId: string,
  ): Promise<BotView[]> {
    return this.bots.list(author.id, projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createBot(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('projectId') projectId: string,
    @Body(new ZodBodyPipe(createBotBodySchema)) body: CreateBotBody,
  ): Promise<BotView> {
    return this.bots.create(author.id, projectId, body.name);
  }

  @Delete(':botId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBot(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('projectId') projectId: string,
    @Param('botId') botId: string,
  ): Promise<void> {
    return this.bots.remove(author.id, projectId, botId);
  }

  @Put(':botId/environment')
  @HttpCode(HttpStatus.OK)
  setEnvironment(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('projectId') projectId: string,
    @Param('botId') botId: string,
    @Body(new ZodBodyPipe(envVarInputListSchema)) body: EnvVarInput[],
  ): Promise<EnvVarView[]> {
    return this.bots.setEnvironment(author.id, projectId, botId, body);
  }

  // Подключение Telegram к боту (connectMessenger, п. 2.11); setWebhook выполняется при публикации
  @Put(':botId/connections/telegram')
  @HttpCode(HttpStatus.OK)
  connectMessenger(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('projectId') projectId: string,
    @Param('botId') botId: string,
    @Body(new ZodBodyPipe(connectTelegramBodySchema)) body: ConnectTelegramBody,
  ): Promise<{ messenger: 'TELEGRAM'; tokenMask: string; botUsername: string }> {
    return this.bots.connectTelegram(author.id, projectId, botId, body.token);
  }

  @Delete(':botId/connections/telegram')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnectMessenger(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('projectId') projectId: string,
    @Param('botId') botId: string,
  ): Promise<void> {
    return this.bots.disconnectTelegram(author.id, projectId, botId);
  }

  publish(_projectId: string, _botId: string): ValidationError[] {
    throw new NotImplementedError('PublicationController.publish');
  }

  republish(_projectId: string, _botId: string): ValidationError[] {
    throw new NotImplementedError('PublicationController.republish');
  }

  isTokenInUse(_messenger: MessengerType, _tokenHash: string): boolean {
    throw new NotImplementedError('PublicationController.isTokenInUse');
  }
}
