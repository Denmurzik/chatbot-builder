import { NotImplementedError, type Scenario } from '@chatbot/model';
import { Controller, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.module';
import { ProjectService } from '../projects/project.service';
import { ScenarioEditor } from '../projects/scenario-editor';
import { ScenarioValidator, type ValidationError } from '../validation/scenario-validator';

/**
 * Класс модели BCE: ImportExportController — экспорт сценария без секретов и импорт с проверкой структуры.
 * Реализует UC-A-29, UC-A-30, UC-A-31; реализация запланирована на спринт 3.
 */
@Controller('import-export')
@UseGuards(JwtGuard)
export class ImportExportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectService: ProjectService,
    private readonly scenarioEditor: ScenarioEditor,
    private readonly validator: ScenarioValidator,
  ) {}

  exportScenario(_projectId: string, _format: string): string {
    void this.prisma;
    void this.projectService;
    void this.scenarioEditor;
    void this.validator;
    throw new NotImplementedError('ImportExportController.exportScenario');
  }

  importScenario(_authorId: string, _file: string): unknown {
    throw new NotImplementedError('ImportExportController.importScenario');
  }

  serialize(_scenario: Scenario, _format: string): string {
    throw new NotImplementedError('ImportExportController.serialize');
  }

  checkStructure(_file: string): ValidationError[] {
    throw new NotImplementedError('ImportExportController.checkStructure');
  }

  deserialize(_file: string): Scenario {
    throw new NotImplementedError('ImportExportController.deserialize');
  }
}
