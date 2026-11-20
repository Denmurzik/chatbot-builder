import 'reflect-metadata';
import { emptyScenario } from '@chatbot/model';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ImportExportController } from '../src/import-export/import-export.controller';
import { PreviewController } from '../src/preview/preview.controller';
import { ProjectController } from '../src/projects/project.controller';
import { ScenarioEditor } from '../src/projects/scenario-editor';
import { PublicationController } from '../src/publication/publication.controller';
import { ScenarioValidator } from '../src/validation/scenario-validator';

describe('Каркас модулей API (skeleton)', () => {
  let moduleRef: TestingModule;
  const prevPolling = process.env.TELEGRAM_POLLING;
  const prevVaultKey = process.env.VAULT_KEY;
  const prevVaultHashKey = process.env.VAULT_HASH_KEY;

  beforeAll(async () => {
    process.env.TELEGRAM_POLLING = '0';
    process.env.VAULT_KEY ??= Buffer.alloc(32, 1).toString('base64');
    process.env.VAULT_HASH_KEY ??= Buffer.alloc(32, 2).toString('base64');

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  }, 60000);

  afterAll(async () => {
    await moduleRef?.close();
    process.env.TELEGRAM_POLLING = prevPolling;
    process.env.VAULT_KEY = prevVaultKey;
    process.env.VAULT_HASH_KEY = prevVaultHashKey;
  });

  it('AppModule компилируется со всеми модулями и разрешает зависимости каркаса', () => {
    expect(moduleRef.get(ScenarioValidator)).toBeInstanceOf(ScenarioValidator);
    expect(moduleRef.get(PublicationController)).toBeInstanceOf(PublicationController);
    expect(moduleRef.get(ImportExportController)).toBeInstanceOf(ImportExportController);
    expect(moduleRef.get(PreviewController)).toBeInstanceOf(PreviewController);
    expect(moduleRef.get(ProjectController)).toBeInstanceOf(ProjectController);
    expect(moduleRef.get(ScenarioEditor)).toBeInstanceOf(ScenarioEditor);
  });

  it('методы PublicationController бросают NotImplementedError с именем класса и метода', () => {
    const controller = moduleRef.get(PublicationController);

    expect(() => controller.publish('proj-1', 'bot-1')).toThrowError(
      'PublicationController.publish',
    );
    expect(() => controller.republish('proj-1', 'bot-1')).toThrowError(
      'PublicationController.republish',
    );
    expect(() => controller.isTokenInUse('TELEGRAM', 'hash')).toThrowError(
      'PublicationController.isTokenInUse',
    );
  });

  it('методы ImportExportController и PreviewController бросают NotImplementedError', () => {
    const importExport = moduleRef.get(ImportExportController);
    const preview = moduleRef.get(PreviewController);
    const scenario = emptyScenario();
    const block = scenario.blocks[0];

    expect(() => importExport.exportScenario('proj-1', 'json')).toThrowError(
      'ImportExportController.exportScenario',
    );
    expect(() => importExport.importScenario('author-1', '{}')).toThrowError(
      'ImportExportController.importScenario',
    );
    expect(() => importExport.serialize(scenario, 'json')).toThrowError(
      'ImportExportController.serialize',
    );
    expect(() => importExport.checkStructure('{}')).toThrowError(
      'ImportExportController.checkStructure',
    );
    expect(() => importExport.deserialize('{}')).toThrowError(
      'ImportExportController.deserialize',
    );

    expect(() => preview.startPreview('proj-1')).toThrowError('PreviewController.startPreview');
    expect(() => preview.sendInput('ctx-1', 'привет')).toThrowError('PreviewController.sendInput');
    expect(() => preview.restartPreview('ctx-1')).toThrowError('PreviewController.restartPreview');
    expect(() => preview.stopAtUnconnectedOutput('ctx-1', block, 'default')).toThrowError(
      'PreviewController.stopAtUnconnectedOutput',
    );
  });

  it('недостающие операции ScenarioEditor и ProjectController бросают NotImplementedError', () => {
    const editor = moduleRef.get(ScenarioEditor);
    const projects = moduleRef.get(ProjectController);
    const scenario = emptyScenario();
    const block = scenario.blocks[0];

    expect(() => editor.addBlock(scenario, 'TEXT_MESSAGE', 100, 100)).toThrowError(
      'ScenarioEditor.addBlock',
    );
    expect(() => editor.updateBlockSettings(block, {})).toThrowError(
      'ScenarioEditor.updateBlockSettings',
    );
    expect(() => editor.deleteBlock(block)).toThrowError('ScenarioEditor.deleteBlock');
    expect(() => editor.connect({ blockId: block.id, output: 'default' }, block)).toThrowError(
      'ScenarioEditor.connect',
    );
    expect(() =>
      editor.deleteTransition({ source: { blockId: block.id, output: 'default' }, target: block.id }),
    ).toThrowError('ScenarioEditor.deleteTransition');

    expect(() => projects.renameProject('proj-1', 'Новое имя')).toThrowError(
      'ProjectController.renameProject',
    );
    expect(() => projects.deleteProject('proj-1')).toThrowError('ProjectController.deleteProject');
  });
});
