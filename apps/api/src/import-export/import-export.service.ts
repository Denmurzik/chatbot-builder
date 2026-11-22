import type { Scenario } from '@chatbot/model';
import { Injectable } from '@nestjs/common';
import {
  checkScenarioStructure,
  parseScenarioOrThrow,
  stripClientSecretsForImport,
  stripScenarioSecretsForExport,
} from '../common/scenario-helpers';
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

  // Сериализует сценарий в JSON формата п. 3.3, очищая значения, шифротексты и маски секретных заголовков (п. 2.13)
  serialize(scenario: Scenario): string {
    return JSON.stringify(stripScenarioSecretsForExport(scenario), null, 2);
  }

  // Проверяет структуру импортируемого JSON по схеме сценария и возвращает список ошибок на русском
  checkStructure(raw: unknown): ValidationIssue[] {
    return checkScenarioStructure(raw);
  }

  // Разбирает и проверяет сценарий; отбрасывает secretValue и secretMask у заголовков
  deserialize(raw: unknown): Scenario {
    const parsed = parseScenarioOrThrow(raw, 'Файл не подходит');
    return stripClientSecretsForImport(parsed);
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
