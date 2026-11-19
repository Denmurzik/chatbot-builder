import type { DialogContext } from '@chatbot/db';
import { NotImplementedError, type Block } from '@chatbot/model';
import type { EventQueue } from '@chatbot/queue';
import { Controller, Inject, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.module';
import { ProjectService } from '../projects/project.service';
import { EVENT_QUEUE } from '../queue/queue.module';

/**
 * Класс модели BCE: PreviewController — управление сеансом превью сценария (без Socket.IO-шлюза).
 * Реализует UC-A-20…A-23; канал PREVIEW в движке — спринт 2, контроллер и Socket.IO-шлюз — спринт 3.
 */
@Controller('preview')
@UseGuards(JwtGuard)
export class PreviewController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_QUEUE) private readonly eventQueue: EventQueue,
    private readonly projectService: ProjectService,
  ) {}

  startPreview(_projectId: string): DialogContext {
    void this.prisma;
    void this.eventQueue;
    void this.projectService;
    throw new NotImplementedError('PreviewController.startPreview');
  }

  sendInput(_ctxId: string, _input: string): void {
    throw new NotImplementedError('PreviewController.sendInput');
  }

  restartPreview(_ctxId: string): void {
    throw new NotImplementedError('PreviewController.restartPreview');
  }

  stopAtUnconnectedOutput(_ctxId: string, _block: Block, _output: string): void {
    throw new NotImplementedError('PreviewController.stopAtUnconnectedOutput');
  }
}
