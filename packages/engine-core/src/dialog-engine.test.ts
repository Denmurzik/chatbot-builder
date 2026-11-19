import { parseScenario, type ChatEvent, type Scenario } from '@chatbot/model';
import { NotImplementedError } from '@chatbot/model';
import { describe, expect, it } from 'vitest';
import { DialogEngine } from './dialog-engine';
import type { DialogContextState, EngineResult } from './outbox';

type Spec = Record<string, unknown> & { id: string; type: string };

// Собирает сценарий из блоков и переходов вида ['from:output', 'to']
function build(blocks: Spec[], transitions: [string, string][]): Scenario {
  return parseScenario({
    formatVersion: 1,
    blocks: blocks.map((b, i) => ({ title: b.id, x: i * 10, y: 0, ...b })),
    transitions: transitions.map(([from, target]) => {
      const [blockId, output] = from.split(':');
      return { source: { blockId, output }, target };
    }),
  });
}

function ev(type: ChatEvent['type'], payload?: string, sourceBlockId?: string): ChatEvent {
  return { type, channel: 'PREVIEW', botId: null, chatId: 'c1', userId: 'u1', payload, sourceBlockId };
}

const text = (t: string) => ev('TEXT_MESSAGE', t);
const texts = (r: EngineResult) => r.outbox.map((m) => m.text);

const engine = new DialogEngine();
const run = (e: ChatEvent, ctx: DialogContextState | null, s: Scenario, env = {}) =>
  engine.handleEvent(e, ctx, s, env);

// Старт → Текст → Ввод имени → Условие → Текст → Выход
const greeting = build(
  [
    { id: 'start', type: 'ENTRY_POINT' },
    { id: 'hello', type: 'TEXT_MESSAGE', text: 'Здравствуйте' },
    { id: 'ask', type: 'TEXT_INPUT', question: 'Как вас зовут?', variableName: 'name' },
    { id: 'cond', type: 'CONDITION', expression: 'name == "Аня"' },
    { id: 'yes', type: 'TEXT_MESSAGE', text: 'Привет, {{name}}' },
    { id: 'no', type: 'TEXT_MESSAGE', text: 'Мы не знакомы, {{name}}' },
    { id: 'end', type: 'EXIT_POINT' },
  ],
  [
    ['start:default', 'hello'],
    ['hello:default', 'ask'],
    ['ask:default', 'cond'],
    ['cond:yes', 'yes'],
    ['cond:no', 'no'],
    ['yes:default', 'end'],
    ['no:default', 'end'],
  ],
);

describe('DialogEngine', () => {
  it('ветвь «да» условия: приветствие по имени и завершение', () => {
    const r1 = run(text('привет'), null, greeting);
    expect(texts(r1)).toEqual(['Здравствуйте', 'Как вас зовут?']);
    expect(r1.context.state).toBe('WAITING_USER');
    const r2 = run(text('Аня'), r1.context, greeting);
    expect(texts(r2)).toEqual(['Привет, Аня']);
    expect(r2.context.state).toBe('FINISHED');
  });

  it('ветвь «нет» условия', () => {
    const r1 = run(ev('START_COMMAND'), null, greeting);
    const r2 = run(text('Борис'), r1.context, greeting);
    expect(texts(r2)).toEqual(['Мы не знакомы, Борис']);
    expect(r2.context.state).toBe('FINISHED');
  });

  it('сообщение после FINISHED начинает новый диалог', () => {
    const r1 = run(text('x'), null, greeting);
    const r2 = run(text('Аня'), r1.context, greeting);
    const r3 = run(text('снова'), r2.context, greeting);
    expect(texts(r3)).toEqual(['Здравствуйте', 'Как вас зовут?']);
    expect(r3.context.state).toBe('WAITING_USER');
  });

  it('/start посреди диалога сбрасывает переменные', () => {
    const s = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        { id: 'ask', type: 'TEXT_INPUT', question: 'Имя?', variableName: 'name' },
        { id: 'ask2', type: 'TEXT_INPUT', question: 'Город?', variableName: 'city' },
        { id: 'end', type: 'EXIT_POINT' },
      ],
      [
        ['start:default', 'ask'],
        ['ask:default', 'ask2'],
        ['ask2:default', 'end'],
      ],
    );
    const r1 = run(text('hi'), null, s);
    const r2 = run(text('Иван'), r1.context, s);
    expect(r2.context.variables).toEqual({ name: 'Иван' });
    const r3 = run(ev('START_COMMAND'), r2.context, s);
    expect(r3.context.variables).toEqual({});
    expect(r3.context.currentBlockId).toBe('ask');
    expect(texts(r3)).toEqual(['Имя?']);
  });

  it('Присваивание и Переключатель', () => {
    const s = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        { id: 'set', type: 'ASSIGNMENT', variableName: 'k', expression: '"b"' },
        { id: 'sw', type: 'SWITCH', variableName: 'k', values: ['a', 'b'] },
        { id: 'ta', type: 'TEXT_MESSAGE', text: 'A' },
        { id: 'tb', type: 'TEXT_MESSAGE', text: 'B' },
        { id: 'te', type: 'TEXT_MESSAGE', text: 'иначе' },
        { id: 'end', type: 'EXIT_POINT' },
      ],
      [
        ['start:default', 'set'],
        ['set:default', 'sw'],
        ['sw:a', 'ta'],
        ['sw:b', 'tb'],
        ['sw:else', 'te'],
        ['tb:default', 'end'],
      ],
    );
    const r = run(text('x'), null, s);
    expect(texts(r)).toEqual(['B']);
    expect(r.context.variables).toEqual({ k: 'b' });
    expect(r.context.state).toBe('FINISHED');

    const s2 = build(
      s.blocks.map((b) => (b.id === 'set' ? { ...b, expression: '"zzz"' } : b)) as Spec[],
      s.transitions.map((t): [string, string] => [`${t.source.blockId}:${t.source.output}`, t.target]),
    );
    expect(texts(run(text('x'), null, s2))).toEqual(['иначе', 'Сценарий не настроен: у блока «te» не подключён выход']);
  });

  describe('выбор из вариантов', () => {
    const s = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        { id: 'pick', type: 'OPTION_CHOICE', question: 'Выберите', options: ['Да', 'Нет'], variableName: 'ans' },
        { id: 'ty', type: 'TEXT_MESSAGE', text: 'ответ {{ans}}: ура' },
        { id: 'tn', type: 'TEXT_MESSAGE', text: 'ответ {{ans}}: жаль' },
        { id: 'end', type: 'EXIT_POINT' },
      ],
      [
        ['start:default', 'pick'],
        ['pick:Да', 'ty'],
        ['pick:Нет', 'tn'],
        ['ty:default', 'end'],
        ['tn:default', 'end'],
      ],
    );

    it('отправляет вопрос с кнопками blockId:индекс', () => {
      const r = run(text('x'), null, s);
      expect(r.outbox).toEqual([
        {
          kind: 'question',
          text: 'Выберите',
          buttons: [
            { label: 'Да', callbackData: 'pick:0' },
            { label: 'Нет', callbackData: 'pick:1' },
          ],
        },
      ]);
    });

    it('принимает нажатие кнопки', () => {
      const r1 = run(text('x'), null, s);
      const r2 = run(ev('BUTTON_PRESS', 'pick:1', 'pick'), r1.context, s);
      expect(texts(r2)).toEqual(['ответ Нет: жаль']);
    });

    it('принимает текст варианта без учёта регистра и пробелов', () => {
      const r1 = run(text('x'), null, s);
      const r2 = run(text('  да '), r1.context, s);
      expect(texts(r2)).toEqual(['ответ Да: ура']);
    });

    it('неверный текст — вопрос отправляется заново', () => {
      const r1 = run(text('x'), null, s);
      const r2 = run(text('может'), r1.context, s);
      expect(r2.outbox).toEqual(r1.outbox);
      expect(r2.context.state).toBe('WAITING_USER');
      expect(r2.context.currentBlockId).toBe('pick');
    });
  });

  describe('выбор из списка', () => {
    // Список приходит заранее в контексте (результат HTTP-блока)
    const withList = (json: string): DialogContextState => ({
      state: 'FINISHED',
      currentBlockId: null,
      variables: { slots: json },
      currentRequestId: null,
    });
    const startWith = (json: string) => {
      // Старт сбрасывает переменные только по /start, поэтому используем TEXT_MESSAGE
      return run(text('go'), withList(json), s2);
    };
    const s2 = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        {
          id: 'pick',
          type: 'LIST_CHOICE',
          question: 'Время?',
          listVariable: 'slots',
          labelField: 't',
          valueField: 'id',
          variableName: 'slotId',
        },
        { id: 'ok', type: 'TEXT_MESSAGE', text: 'слот {{slotId}}' },
        { id: 'none', type: 'TEXT_MESSAGE', text: 'нет времени' },
        { id: 'end', type: 'EXIT_POINT' },
      ],
      [
        ['start:default', 'pick'],
        ['pick:default', 'ok'],
        ['pick:noOptions', 'none'],
        ['ok:default', 'end'],
        ['none:default', 'end'],
      ],
    );

    it('показывает кнопки из массива и сохраняет valueField', () => {
      const r1 = startWith('[{"t":"10:00","id":"1"}]');
      expect(r1.outbox).toEqual([
        { kind: 'question', text: 'Время?', buttons: [{ label: '10:00', callbackData: 'pick:0' }] },
      ]);
      const r2 = run(ev('BUTTON_PRESS', 'pick:0', 'pick'), r1.context, s2);
      expect(texts(r2)).toEqual(['слот 1']);
      expect(r2.context.variables.slotId).toBe('1');
    });

    it('пустой список, не массив и отсутствие переменной — выход noOptions', () => {
      for (const json of ['[]', '{"a":1}', 'не json']) {
        expect(texts(startWith(json))).toEqual(['нет времени']);
      }
      const r = run(text('go'), null, s2);
      expect(texts(r)).toEqual(['нет времени']);
    });
  });

  it('устаревшая кнопка (чужой blockId) — вопрос текущего блока заново', () => {
    const s = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        { id: 'p1', type: 'OPTION_CHOICE', question: 'Первый', options: ['а', 'б'], variableName: 'v1' },
        { id: 'p2', type: 'OPTION_CHOICE', question: 'Второй', options: ['в', 'г'], variableName: 'v2' },
        { id: 'end', type: 'EXIT_POINT' },
      ],
      [
        ['start:default', 'p1'],
        ['p1:а', 'p2'],
        ['p1:б', 'p2'],
        ['p2:в', 'end'],
        ['p2:г', 'end'],
      ],
    );
    const r1 = run(text('x'), null, s);
    const r2 = run(ev('BUTTON_PRESS', 'p1:0', 'p1'), r1.context, s);
    expect(r2.context.currentBlockId).toBe('p2');
    const r3 = run(ev('BUTTON_PRESS', 'p1:1', 'p1'), r2.context, s);
    expect(r3.context.currentBlockId).toBe('p2');
    expect(r3.context.variables).toEqual({ v1: 'а' });
    expect(r3.outbox).toHaveLength(1);
    expect(r3.outbox[0]).toMatchObject({ kind: 'question', text: 'Второй' });
  });

  it('цикл Присваивание↔Условие: на 101-м шаге FINISHED и сообщение о зацикливании', () => {
    const s = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        { id: 'set', type: 'ASSIGNMENT', variableName: 'i', expression: '1' },
        { id: 'cond', type: 'CONDITION', expression: 'true' },
        { id: 'end', type: 'EXIT_POINT' },
      ],
      [
        ['start:default', 'set'],
        ['set:default', 'cond'],
        ['cond:yes', 'set'],
        ['cond:no', 'end'],
      ],
    );
    const r = run(text('x'), null, s);
    expect(r.context.state).toBe('FINISHED');
    expect(texts(r)).toEqual(['Диалог остановлен: сценарий зациклился']);
    // шаги: start(1), set(2), cond(3)…; 101-й шаг — cond
    expect(r.highlightBlockId).toBe('cond');
  });

  it('автопроход ровно из 100 шагов не считается зацикливанием', () => {
    const s = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        { id: 't', type: 'TEXT_MESSAGE', text: 'ok' },
        { id: 'end', type: 'EXIT_POINT' },
      ],
      [
        ['start:default', 't'],
        ['t:default', 'end'],
      ],
    );
    const r = new DialogEngine({ maxAutopassSteps: 3 }).handleEvent(text('x'), null, s, {});
    expect(texts(r)).toEqual(['ok']);
    const r2 = new DialogEngine({ maxAutopassSteps: 2 }).handleEvent(text('x'), null, s, {});
    expect(texts(r2)).toEqual(['ok', 'Диалог остановлен: сценарий зациклился']);
  });

  it('неподключённый выход: FINISHED, системное сообщение и подсветка блока', () => {
    const s = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        { id: 't', type: 'TEXT_MESSAGE', title: 'Привет', text: 'ok' },
      ],
      [['start:default', 't']],
    );
    const r = run(text('x'), null, s);
    expect(texts(r)).toEqual(['ok', 'Сценарий не настроен: у блока «Привет» не подключён выход']);
    expect(r.context.state).toBe('FINISHED');
    expect(r.highlightBlockId).toBe('t');
  });

  describe('HTTP-запрос', () => {
    const s = build(
      [
        { id: 'start', type: 'ENTRY_POINT' },
        { id: 'ask', type: 'TEXT_INPUT', question: 'Город?', variableName: 'city' },
        {
          id: 'http',
          type: 'HTTP_REQUEST',
          method: 'POST',
          url: '{{env.API_URL}}/find?city={{city}}',
          headers: [
            { name: 'X-City', value: '{{city}}', secret: false },
            { name: 'Authorization', value: '{{env.TOKEN}}', secret: true },
          ],
          body: '{"city":"{{city}}"}',
          variableName: 'resp',
          errorVariable: 'err',
          timeoutSec: 10,
          retryCount: 2,
          retryIntervalSec: 5,
          errorStrategy: 'EXIT_ERROR',
          suspendText: null,
          responseMappings: [],
        },
      ],
      [
        ['start:default', 'ask'],
        ['ask:default', 'http'],
      ],
    );

    it('возвращает httpRequest с подстановкой, WAITING_EXTERNAL и requestId = null', () => {
      const r1 = run(text('x'), null, s, { API_URL: 'https://api.test' });
      const r2 = run(text('Санкт "Петербург"'), r1.context, s, { API_URL: 'https://api.test' });
      expect(r2.context.state).toBe('WAITING_EXTERNAL');
      expect(r2.context.currentRequestId).toBeNull();
      expect(r2.httpRequest).toEqual({
        blockId: 'http',
        method: 'POST',
        url: encodeURIComponent('https://api.test') + '/find?city=' + encodeURIComponent('Санкт "Петербург"'),
        headers: [
          { name: 'X-City', value: 'Санкт "Петербург"', secret: false },
          { name: 'Authorization', value: '{{env.TOKEN}}', secret: true },
        ],
        body: '{"city":"Санкт \\"Петербург\\""}',
        timeoutSec: 10,
        retryCount: 2,
        retryIntervalSec: 5,
      });
    });

    it('пока ждёт внешний ответ, сообщение пользователя получает «Подождите»', () => {
      const r1 = run(text('x'), null, s);
      const r2 = run(text('Омск'), r1.context, s);
      const r3 = run(text('эй'), r2.context, s);
      expect(texts(r3)).toEqual(['Подождите, обрабатываю запрос']);
      expect(r3.context.state).toBe('WAITING_EXTERNAL');
      expect(r3.httpRequest).toBeNull();
    });

    it('ответ внешней системы — заглушка спринта 2', () => {
      const r1 = run(text('x'), null, s);
      const r2 = run(text('Омск'), r1.context, s);
      expect(() => run(ev('RESPONSE_RECEIVED'), r2.context, s)).toThrow(NotImplementedError);
      expect(() => run(ev('REQUEST_FAILED'), r2.context, s)).toThrow(NotImplementedError);
    });
  });

  it('не мутирует переданный контекст', () => {
    const r1 = run(text('x'), null, greeting);
    const frozen = JSON.stringify(r1.context);
    run(text('Аня'), r1.context, greeting);
    expect(JSON.stringify(r1.context)).toBe(frozen);
  });
});
