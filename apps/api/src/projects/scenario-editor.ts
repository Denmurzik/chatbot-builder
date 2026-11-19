import { Prisma } from '@chatbot/db';
import {
  NotImplementedError,
  parseScenario,
  type Block,
  type BlockType,
  type HttpHeader,
  type Scenario,
  type Transition,
} from '@chatbot/model';
import { headerAad, SecretVault } from '@chatbot/vault';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ZodError } from 'zod';
import { createValidationException } from '../common/zod-body.pipe';
import { PrismaService } from '../prisma/prisma.module';

// Редактор сценария (класс модели ScenarioEditor): проверка структуры и сохранение сценария проекта
@Injectable()
export class ScenarioEditor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SecretVault,
  ) {}

  // Проверяет структуру сценария через parseScenario и бросает 400 с issues при ошибке
  validateScenario(rawScenario: unknown): Scenario {
    try {
      return parseScenario(rawScenario);
    } catch (err) {
      if (err instanceof ZodError) {
        throw createValidationException(err, 'Некорректный сценарий');
      }
      throw err;
    }
  }

  // Сохраняет сценарий проекта с проверкой принадлежности автору и структурной целостности графа
  async saveScenario(
    authorId: string,
    projectId: string,
    rawScenario: unknown,
  ): Promise<{ updatedAt: Date }> {
    // Проверяем владение до валидации тела, чтобы не раскрывать наличие чужих проектов
    const existing = await this.prisma.client.project.findFirst({
      where: { id: projectId, authorId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Проект не найден');
    }

    const scenario = this.encryptSecretHeaders(projectId, this.validateScenario(rawScenario));

    try {
      const updated = await this.prisma.client.project.update({
        where: { id: projectId, authorId },
        data: {
          scenario: scenario as unknown as Prisma.InputJsonValue,
        },
        select: { updatedAt: true },
      });

      return { updatedAt: updated.updatedAt };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Проект не найден');
      }
      throw err;
    }
  }

  // Шифрует открытые значения секретных HTTP-заголовков перед записью в БД (п. 2.13)
  private encryptSecretHeaders(projectId: string, scenario: Scenario): Scenario {
    return {
      ...scenario,
      blocks: scenario.blocks.map((block) => {
        if (block.type !== 'HTTP_REQUEST') return block;
        return {
          ...block,
          headers: block.headers.map((header): HttpHeader => {
            if (!header.secret) {
              return { name: header.name, value: header.value, secret: false };
            }
            if (header.value !== '') {
              return {
                name: header.name,
                value: '',
                secret: true,
                secretValue: this.vault.encrypt(header.value, headerAad(projectId, header.name)),
              };
            }
            // Повторное сохранение без изменения секрета или пустой секрет (поймает валидатор спринта 2)
            return header.secretValue
              ? { name: header.name, value: '', secret: true, secretValue: header.secretValue }
              : { name: header.name, value: '', secret: true };
          }),
        };
      }),
    };
  }

  // Операции модели BCE (редактирование графа выполняется на клиенте и сохраняется целиком; UC-A-05..A-19, спринт 2)
  addBlock(_scenario: Scenario, _type: BlockType, _x: number, _y: number): Block {
    throw new NotImplementedError('ScenarioEditor.addBlock');
  }

  updateBlockSettings(_block: Block, _settings: Record<string, unknown>): void {
    throw new NotImplementedError('ScenarioEditor.updateBlockSettings');
  }

  deleteBlock(_block: Block): void {
    throw new NotImplementedError('ScenarioEditor.deleteBlock');
  }

  connect(_output: { blockId: string; output: string }, _target: Block): Transition {
    throw new NotImplementedError('ScenarioEditor.connect');
  }

  deleteTransition(_transition: Transition): void {
    throw new NotImplementedError('ScenarioEditor.deleteTransition');
  }
}
