import type { Bot, MessengerType } from '@chatbot/db';
import { NotImplementedError, type EnvironmentVariable } from '@chatbot/model';
import type { EventQueue } from '@chatbot/queue';
import { SecretVault } from '@chatbot/vault';
import { Controller, Inject, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.module';
import { ProjectService } from '../projects/project.service';
import { EVENT_QUEUE } from '../queue/queue.module';
import { ScenarioValidator, type ValidationError } from '../validation/scenario-validator';

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
  ) {}

  createBot(_projectId: string, _name: string): Bot {
    void this.prisma;
    void this.eventQueue;
    void this.validator;
    void this.vault;
    void this.projectService;
    throw new NotImplementedError('PublicationController.createBot');
  }

  setEnvironment(_botId: string, _variables: EnvironmentVariable[]): void {
    throw new NotImplementedError('PublicationController.setEnvironment');
  }

  connectMessenger(_botId: string, _messenger: MessengerType, _token: string): void {
    throw new NotImplementedError('PublicationController.connectMessenger');
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
