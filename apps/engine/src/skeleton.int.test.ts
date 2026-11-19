import 'reflect-metadata';
import { NotImplementedError, type ChatEvent, type HttpRequestBlock } from '@chatbot/model';
import { SecretVault } from '@chatbot/vault';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { DialogService } from './dialog/dialog.service';
import { MessengerGateway } from './dialog/ports';
import { EventDispatcher } from './dispatcher/event-dispatcher';
import { ExternalApiClient } from './http/external-api-client';
import { HttpRequestExecutor } from './http/http-request-executor';
import { ResponseParser } from './http/response-parser';
import { PreviewPublisher } from './preview/preview-publisher';

describe('Каркас модулей Engine (skeleton)', () => {
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
    expect(moduleRef.get(HttpRequestExecutor)).toBeInstanceOf(HttpRequestExecutor);
    expect(moduleRef.get(ResponseParser)).toBeInstanceOf(ResponseParser);
    expect(moduleRef.get(PreviewPublisher)).toBeInstanceOf(PreviewPublisher);
    expect(moduleRef.get(EventDispatcher)).toBeInstanceOf(EventDispatcher);
    expect(moduleRef.get(ExternalApiClient)).toBeInstanceOf(ExternalApiClient);
    expect(moduleRef.get(MessengerGateway)).toBeInstanceOf(MessengerGateway);
    expect(moduleRef.get(SecretVault)).toBeInstanceOf(SecretVault);
  });

  it('ResponseParser.parse и ResponseParser.extract работают через @chatbot/engine-core', () => {
    const parser = moduleRef.get(ResponseParser);
    const json = parser.parse('{"data":{"slots":[{"time":"10:00"}]}}');

    expect(parser.extract(json, '$.data.slots[0].time')).toEqual({
      found: true,
      value: '10:00',
    });
    expect(parser.extract(json, '$.data.missing')).toEqual({ found: false });
  });

  it('методы HttpRequestExecutor и PreviewPublisher бросают NotImplementedError', () => {
    const executor = moduleRef.get(HttpRequestExecutor);
    const preview = moduleRef.get(PreviewPublisher);
    const httpBlock: HttpRequestBlock = {
      id: 'http1',
      type: 'HTTP_REQUEST',
      title: 'Запрос',
      x: 0,
      y: 0,
      method: 'GET',
      url: 'https://example.test/api',
      headers: [],
      body: '',
      variableName: 'resp',
      errorVariable: 'err',
      timeoutSec: 5,
      retryCount: 1,
      retryIntervalSec: 1,
      errorStrategy: 'EXIT_ERROR',
      suspendText: null,
      responseMappings: [],
    };

    expect(() => executor.createAndSend(httpBlock, 'ctx-1')).toThrowError(NotImplementedError);
    expect(() => executor.createAndSend(httpBlock, 'ctx-1')).toThrowError(
      'HttpRequestExecutor.createAndSend',
    );
    expect(() => executor.handleResponse('ctx-1')).toThrowError(
      'HttpRequestExecutor.handleResponse',
    );
    expect(() => executor.handleFailure('ctx-1')).toThrowError(
      'HttpRequestExecutor.handleFailure',
    );
    expect(() => executor.resend('req-1')).toThrowError('HttpRequestExecutor.resend');
    expect(() => executor.resume('ctx-1')).toThrowError('HttpRequestExecutor.resume');
    expect(() => executor.recoverAfterRestart()).toThrowError(
      'HttpRequestExecutor.recoverAfterRestart',
    );

    expect(() => preview.publishMessage('preview:1', 'Привет')).toThrowError(
      'PreviewPublisher.publishMessage',
    );
    expect(() => preview.publishCurrentBlock('preview:1', 'b1')).toThrowError(
      'PreviewPublisher.publishCurrentBlock',
    );
    expect(() => preview.publishVariables('preview:1', {})).toThrowError(
      'PreviewPublisher.publishVariables',
    );
    expect(() => preview.publishSystemMessage('preview:1', 'Стоп')).toThrowError(
      'PreviewPublisher.publishSystemMessage',
    );
  });

  it('заглушки недостающих операций EventDispatcher, ExternalApiClient, MessengerGateway и SecretVault бросают NotImplementedError', () => {
    const dispatcher = moduleRef.get(EventDispatcher);
    const dialogService = moduleRef.get(DialogService);
    const apiClient = moduleRef.get(ExternalApiClient);
    const gateway = moduleRef.get(MessengerGateway);
    const vault = moduleRef.get(SecretVault);
    const event: ChatEvent = {
      type: 'RESPONSE_RECEIVED',
      channel: 'MESSENGER',
      botId: 'bot-1',
      chatId: 'tg:1',
      userId: 'u1',
      requestId: 'req-1',
    };

    expect(() => dispatcher.isStale(event, null)).toThrowError('EventDispatcher.isStale');
    expect(() => dispatcher.broadcast('bot-1', 'VERSION_PUBLISHED')).toThrowError(
      'EventDispatcher.broadcast',
    );
    expect(() => dispatcher.takeNext('bot-1', 'tg:1')).toThrowError('EventDispatcher.takeNext');

    expect(() => dialogService.findContexts('bot-1')).toThrowError('DialogService.findContexts');
    expect(() => dialogService.resetDialogs('bot-1')).toThrowError('DialogService.resetDialogs');

    expect(() => apiClient.findSentRequest('req-1')).toThrowError(
      'ExternalApiClient.findSentRequest',
    );

    expect(() => gateway.verifyToken('TELEGRAM', 'tok')).toThrowError(
      'MessengerGateway.verifyToken',
    );
    expect(() => gateway.connectBot('bot-1', 'TELEGRAM', 'tok')).toThrowError(
      'MessengerGateway.connectBot',
    );
    expect(() => gateway.disconnectBot('TELEGRAM', 'tok')).toThrowError(
      'MessengerGateway.disconnectBot',
    );
    expect(() => gateway.sendQuestion('bot-1', 'tg:1', 'Вопрос?', ['Да', 'Нет'])).toThrowError(
      'MessengerGateway.sendQuestion',
    );

    expect(() => vault.mask({ cipherText: 'v1:a:b:c', mask: '••••1234' })).toThrowError(
      'SecretVault.mask',
    );
  });
});
