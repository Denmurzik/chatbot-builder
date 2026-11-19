import { NotImplementedError, type Block, type Scenario } from '@chatbot/model';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

// Ошибка или предупреждение проверки сценария (класс модели ValidationError, п. 2.10)
export interface ValidationError {
  rule: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
  blockId?: string;
}

/**
 * Класс модели BCE: ScenarioValidator — смысловая проверка сценария и подключений бота.
 * Реализует UC-A-24, UC-A-27, SD-6; реализация запланирована на спринт 2.
 */
@Injectable()
export class ScenarioValidator {
  constructor(private readonly prisma: PrismaService) {}

  validate(_scenario: Scenario): ValidationError[] {
    void this.prisma;
    throw new NotImplementedError('ScenarioValidator.validate');
  }

  checkSingleEntryPoint(_scenario: Scenario): ValidationError[] {
    throw new NotImplementedError('ScenarioValidator.checkSingleEntryPoint');
  }

  checkOutputsConnected(_scenario: Scenario): ValidationError[] {
    throw new NotImplementedError('ScenarioValidator.checkOutputsConnected');
  }

  checkRequiredFields(_scenario: Scenario): ValidationError[] {
    throw new NotImplementedError('ScenarioValidator.checkRequiredFields');
  }

  checkConnections(_botId: string): ValidationError[] {
    throw new NotImplementedError('ScenarioValidator.checkConnections');
  }

  checkBlockFields(_block: Block): ValidationError[] {
    throw new NotImplementedError('ScenarioValidator.checkBlockFields');
  }

  checkLoops(_scenario: Scenario): ValidationError[] {
    throw new NotImplementedError('ScenarioValidator.checkLoops');
  }
}
