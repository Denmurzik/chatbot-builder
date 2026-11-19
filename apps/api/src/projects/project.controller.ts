import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { type AuthenticatedAuthor, CurrentAuthor } from '../auth/current-author.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import {
  type CreatedProject,
  type ProjectDetails,
  ProjectService,
  type ProjectSummary,
} from './project.service';
import { ScenarioEditor } from './scenario-editor';

const createProjectBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Название проекта не может быть пустым')
    .max(200, 'Название проекта слишком длинное'),
});

type CreateProjectBody = z.infer<typeof createProjectBodySchema>;

// Контроллер проектов и сохранения сценария (класс модели ProjectController)
@Controller('projects')
@UseGuards(JwtGuard)
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly scenarioEditor: ScenarioEditor,
  ) {}

  @Get()
  list(@CurrentAuthor() author: AuthenticatedAuthor): Promise<ProjectSummary[]> {
    return this.projectService.listByAuthor(author.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Body(new ZodBodyPipe(createProjectBodySchema)) body: CreateProjectBody,
  ): Promise<CreatedProject> {
    return this.projectService.create(author.id, body.name);
  }

  @Get(':id')
  getById(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('id') id: string,
  ): Promise<ProjectDetails> {
    return this.projectService.getById(author.id, id);
  }

  @Put(':id/scenario')
  @HttpCode(HttpStatus.OK)
  saveScenario(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ updatedAt: Date }> {
    return this.scenarioEditor.saveScenario(author.id, id, body);
  }
}
