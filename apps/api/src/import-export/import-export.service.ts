import {
  parseScenario,
  type HttpHeader,
  type Scenario,
} from '@chatbot/model';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ZodError, ZodIssueCode, type ZodIssue } from 'zod';
import type { ValidationIssue } from '../common/zod-body.pipe';
import { ProjectService } from '../projects/project.service';
import { ScenarioEditor } from '../projects/scenario-editor';

export interface ExportedScenario {
  fileName: string;
  json: string;
}

export interface ImportScenarioResult {
  updatedAt: Date;
  secretsToFill: number;
}

const UNSAFE_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
const MAX_FILENAME_BASE_LENGTH = 100;

// Формирует безопасное имя JSON-файла из названия проекта (кириллица сохраняется)
export function buildExportFileName(projectName: string): string {
  let cleaned = '';
  for (const ch of projectName) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || UNSAFE_FILENAME_CHARS.has(ch)) {
      cleaned += ' ';
    } else {
      cleaned += ch;
    }
  }

  let base = cleaned
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');

  if (base.toLowerCase().endsWith('.json')) {
    base = base.slice(0, -5).replace(/[\s.]+$/g, '');
  }

  if (base.length > MAX_FILENAME_BASE_LENGTH) {
    base = base.slice(0, MAX_FILENAME_BASE_LENGTH).replace(/[\s.]+$/g, '');
  }

  return `${base || 'scenario'}.json`;
}

function translateZodIssue(issue: ZodIssue): string {
  switch (issue.code) {
    case ZodIssueCode.custom:
      return issue.message;
    case ZodIssueCode.invalid_literal:
      if (issue.path.length === 1 && issue.path[0] === 'formatVersion') {
        return `Неподдерживаемая версия формата (ожидалась ${String(issue.expected)})`;
      }
      return `Ожидалось значение ${JSON.stringify(issue.expected)}`;
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined') {
        return 'Обязательное поле не заполнено';
      }
      return `Неверный тип значения (ожидался ${issue.expected}, получен ${issue.received})`;
    case ZodIssueCode.invalid_union_discriminator:
      return 'Неизвестный тип блока';
    case ZodIssueCode.invalid_enum_value:
      return `Недопустимое значение (допустимо: ${issue.options.join(', ')})`;
    case ZodIssueCode.too_small:
      // Если у поля задано собственное сообщение на русском — используем его
      return /^(Array|String|Number|Date) must/.test(issue.message)
        ? `Значение меньше допустимого (${String(issue.minimum)})`
        : issue.message;
    case ZodIssueCode.too_big:
      return /^(Array|String|Number|Date) must/.test(issue.message)
        ? `Значение больше допустимого (${String(issue.maximum)})`
        : issue.message;
    default:
      return issue.message;
  }
}

function formatRussianIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: translateZodIssue(issue),
  }));
}

// Сервис экспорта и импорта сценариев JSON (UC-A-29, UC-A-30, UC-A-31; операции serialize/checkStructure/deserialize)
@Injectable()
export class ImportExportService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly scenarioEditor: ScenarioEditor,
  ) {}

  // Выгружает сценарий проекта без секретов и окружения
  async exportScenario(authorId: string, projectId: string): Promise<ExportedScenario> {
    const project = await this.projectService.getById(authorId, projectId);
    return {
      fileName: buildExportFileName(project.name),
      json: this.serialize(project.scenario),
    };
  }

  // Импортирует JSON-сценарий в проект владельца; при ошибке валидации сценарий не меняется
  async importScenario(
    authorId: string,
    projectId: string,
    rawBody: unknown,
  ): Promise<ImportScenarioResult> {
    // Проверяем владение до разбора тела, чтобы не раскрывать наличие чужих проектов
    await this.projectService.getById(authorId, projectId);

    const scenario = this.deserialize(rawBody);
    const secretsToFill = this.countSecretsToFill(scenario);
    const { updatedAt } = await this.scenarioEditor.saveScenario(authorId, projectId, scenario);

    return { updatedAt, secretsToFill };
  }

  // Сериализует сценарий в JSON формата п. 3.3, очищая значения и шифротексты секретных заголовков (п. 2.13)
  serialize(scenario: Scenario): string {
    const sanitized: Scenario = {
      formatVersion: scenario.formatVersion,
      blocks: scenario.blocks.map((block) => {
        if (block.type !== 'HTTP_REQUEST') return block;
        return {
          ...block,
          headers: block.headers.map((header): HttpHeader =>
            header.secret
              ? { name: header.name, value: '', secret: true }
              : { name: header.name, value: header.value, secret: false },
          ),
        };
      }),
      transitions: scenario.transitions,
    };

    return JSON.stringify(sanitized, null, 2);
  }

  // Проверяет структуру импортируемого JSON по схеме сценария и возвращает список ошибок на русском
  checkStructure(raw: unknown): ValidationIssue[] {
    try {
      parseScenario(raw);
      return [];
    } catch (err) {
      if (err instanceof ZodError) {
        return formatRussianIssues(err);
      }
      throw err;
    }
  }

  // Разбирает и проверяет сценарий; отбрасывает secretValue у заголовков (чужой шифротекст не расшифруется из-за AAD)
  deserialize(raw: unknown): Scenario {
    let parsed: Scenario;
    try {
      parsed = parseScenario(raw);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Файл не подходит',
          issues: formatRussianIssues(err),
        });
      }
      throw err;
    }

    return {
      formatVersion: parsed.formatVersion,
      blocks: parsed.blocks.map((block) => {
        if (block.type !== 'HTTP_REQUEST') return block;
        return {
          ...block,
          headers: block.headers.map((header): HttpHeader => ({
            name: header.name,
            value: header.value,
            secret: header.secret,
          })),
        };
      }),
      transitions: parsed.transitions,
    };
  }

  // Считает количество секретных заголовков, у которых не задано открытое значение
  private countSecretsToFill(scenario: Scenario): number {
    let count = 0;
    for (const block of scenario.blocks) {
      if (block.type !== 'HTTP_REQUEST') continue;
      for (const header of block.headers) {
        if (header.secret && header.value === '') {
          count += 1;
        }
      }
    }
    return count;
  }
}
