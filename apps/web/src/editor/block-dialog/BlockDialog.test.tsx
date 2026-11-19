import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Edge } from '@xyflow/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ru } from '@/i18n/ru';
import { scenarioToFlow, type BlockNode, type BlockNodeData } from '../convert';
import { setupCodeMirrorJsdom } from '../fields/cm-test-setup';
import { BlockDialog } from './BlockDialog';

beforeAll(() => {
  setupCodeMirrorJsdom();
});
afterEach(cleanup);

const flow = scenarioToFlow({
  formatVersion: 1,
  blocks: [
    { id: 'entry', type: 'ENTRY_POINT', title: 'Старт', x: 0, y: 0 },
    {
      id: 'ask',
      type: 'TEXT_INPUT',
      title: 'Ввод имени',
      question: 'Как вас зовут?',
      variableName: 'name',
      x: 200,
      y: 0,
    },
    {
      id: 'cond',
      type: 'CONDITION',
      title: 'Это Анна?',
      expression: 'name == "Анна"',
      x: 400,
      y: 0,
    },
    { id: 'yes', type: 'TEXT_MESSAGE', title: 'Привет, Анна', text: 'Привет!', x: 600, y: 0 },
    {
      id: 'msg',
      type: 'TEXT_MESSAGE',
      title: 'Приветствие',
      text: 'Здравствуйте, {{name}}!',
      x: 600,
      y: 100,
    },
  ],
  transitions: [
    { source: { blockId: 'entry', output: 'default' }, target: 'ask' },
    { source: { blockId: 'ask', output: 'default' }, target: 'cond' },
    { source: { blockId: 'cond', output: 'yes' }, target: 'yes' },
    { source: { blockId: 'ask', output: 'default' }, target: 'msg' },
  ],
});

interface HarnessProps {
  nodeId: string;
  onClose?: () => void;
  onChangeSpy?: (id: string, data: BlockNodeData) => void;
  edges?: Edge[];
  focusTitle?: boolean;
}

// Состояние узлов хранит обвязка — как EditorPage: изменения применяются сразу
function Harness({
  nodeId,
  onClose = () => {},
  onChangeSpy,
  edges = flow.edges,
  focusTitle,
}: HarnessProps) {
  const [nodes, setNodes] = useState<BlockNode[]>(flow.nodes);
  return (
    <BlockDialog
      nodeId={nodeId}
      nodes={nodes}
      edges={edges}
      focusTitle={focusTitle}
      onClose={onClose}
      onChange={(id, data) => {
        onChangeSpy?.(id, data);
        setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data } : n)));
      }}
    />
  );
}

describe('BlockDialog', () => {
  it('колонка «Вход» показывает переменные блоков выше по графу с источником', () => {
    render(<Harness nodeId="cond" />);
    const input = screen.getByRole('region', { name: ru.blockDialog.input });
    expect(within(input).getByText('name')).toBeTruthy();
    expect(within(input).getByText('из блока «Ввод имени»')).toBeTruthy();
  });

  it('у первого блока после «Старта» в колонке «Вход» переменных нет', () => {
    render(<Harness nodeId="ask" />);
    const input = screen.getByRole('region', { name: ru.blockDialog.input });
    expect(within(input).getByText(ru.blockDialog.inputEmpty)).toBeTruthy();
  });

  it('«Выход» для Условия с тестовыми значениями показывает сработавший выход «Да»', () => {
    render(<Harness nodeId="cond" />);
    const input = screen.getByRole('region', { name: ru.blockDialog.input });
    fireEvent.change(within(input).getByLabelText(/Тестовое значение: name/), {
      target: { value: 'Анна' },
    });
    const output = screen.getByRole('region', { name: ru.blockDialog.output });
    expect(within(output).getByText('Сработает выход: Да')).toBeTruthy();

    fireEvent.change(within(input).getByLabelText(/Тестовое значение: name/), {
      target: { value: 'Борис' },
    });
    expect(within(output).getByText('Сработает выход: Нет')).toBeTruthy();
  });

  it('«Выход» показывает записываемые переменные и блоки, куда ведут связи', () => {
    render(<Harness nodeId="cond" />);
    const output = screen.getByRole('region', { name: ru.blockDialog.output });
    expect(within(output).getByText('ведёт в «Привет, Анна»')).toBeTruthy();
    // Выход «Нет» не подключён
    expect(within(output).getByText(ru.blockDialog.notConnected)).toBeTruthy();
    expect(within(output).getByText(ru.blockDialog.writesNone)).toBeTruthy();
  });

  it('«Выход» сообщения показывает текст после подстановки тестовых значений', () => {
    render(<Harness nodeId="msg" />);
    fireEvent.change(screen.getByLabelText(/Тестовое значение: name/), {
      target: { value: 'Анна' },
    });
    const output = screen.getByRole('region', { name: ru.blockDialog.output });
    expect(within(output).getByText('Здравствуйте, Анна!')).toBeTruthy();
  });

  it('название блока правится в заголовке окна и применяется сразу', () => {
    const spy = vi.fn();
    render(<Harness nodeId="ask" onChangeSpy={spy} />);
    fireEvent.change(screen.getByLabelText(ru.blockDialog.titleLabel), {
      target: { value: 'Имя клиента' },
    });
    expect(spy).toHaveBeenCalledWith('ask', expect.objectContaining({ title: 'Имя клиента' }));
    expect((screen.getByLabelText(ru.blockDialog.titleLabel) as HTMLInputElement).value).toBe(
      'Имя клиента',
    );
  });

  it('при «Переименовать» фокус сразу в названии, текст выделен', async () => {
    render(<Harness nodeId="ask" focusTitle />);
    const title = screen.getByLabelText(ru.blockDialog.titleLabel) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(title.selectionStart).toBe(0);
    expect(title.selectionEnd).toBe(title.value.length);
  });

  it('Esc закрывает окно', () => {
    const onClose = vi.fn();
    render(<Harness nodeId="ask" onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc при открытом списке подсказок не закрывает окно', () => {
    const onClose = vi.fn();
    render(<Harness nodeId="ask" onClose={onClose} />);
    const tooltip = document.createElement('div');
    tooltip.className = 'cm-tooltip cm-tooltip-autocomplete';
    document.body.append(tooltip);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    tooltip.remove();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('«Вставить» ставит переменную в шаблон по позиции курсора', async () => {
    render(<Harness nodeId="msg" />);
    const editor = screen.getByLabelText(ru.fields.text);
    editor.focus();
    fireEvent.focusIn(editor);
    const insert = screen.getByRole('button', { name: `${ru.blockDialog.insert} name` });
    await waitFor(() => expect((insert as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(insert);
    await waitFor(() =>
      expect(screen.getByLabelText(ru.fields.text).textContent).toContain('{{name}}'),
    );
  });

  it('«Вставить» недоступна, пока курсор не поставлен в поле настроек', () => {
    render(<Harness nodeId="msg" />);
    const insert = screen.getByRole('button', { name: `${ru.blockDialog.insert} name` });
    expect((insert as HTMLButtonElement).disabled).toBe(true);
  });

  describe('конструктор условий', () => {
    it('показывает строки из выражения и пересобирает выражение при правке', async () => {
      const spy = vi.fn();
      render(<Harness nodeId="cond" onChangeSpy={spy} />);
      expect((screen.getByLabelText('Переменная 1') as HTMLInputElement).value).toBe('name');
      expect((screen.getByLabelText('Значение 1') as HTMLInputElement).value).toBe('Анна');

      fireEvent.change(screen.getByLabelText('Значение 1'), { target: { value: 'Ольга' } });
      expect(spy).toHaveBeenLastCalledWith(
        'cond',
        expect.objectContaining({ expression: 'name == "Ольга"' }),
      );

      fireEvent.click(screen.getByRole('button', { name: ru.condition.add }));
      fireEvent.change(screen.getByLabelText('Переменная 2'), { target: { value: 'name' } });
      fireEvent.change(screen.getByLabelText('Оператор 2'), { target: { value: 'notEmpty' } });
      fireEvent.change(screen.getByLabelText(ru.condition.join), { target: { value: 'or' } });
      expect(spy).toHaveBeenLastCalledWith(
        'cond',
        expect.objectContaining({ expression: 'name == "Ольга" || name != ""' }),
      );
    });

    it('предупреждает о переменной, которой нет выше по сценарию', () => {
      render(<Harness nodeId="cond" />);
      fireEvent.change(screen.getByLabelText('Переменная 1'), { target: { value: 'ghost' } });
      expect(screen.getByText(ru.condition.unknownVariable('ghost'))).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Оператор 1'), { target: { value: 'empty' } });
      expect(screen.getByText(ru.condition.unknownVariable('ghost'))).toBeTruthy();
    });

    it('выражение вне конструктора открывается в режиме «Выражение», текст сохраняется', () => {
      const complex = { ...flow.nodes[2]!.data, expression: '(a < 3) && !b' } as BlockNodeData;
      const nodes = flow.nodes.map((n) => (n.id === 'cond' ? { ...n, data: complex } : n));
      render(
        <BlockDialog
          nodeId="cond"
          nodes={nodes}
          edges={flow.edges}
          onChange={() => {}}
          onClose={() => {}}
        />,
      );
      expect(screen.queryByLabelText('Переменная 1')).toBeNull();
      expect(screen.getByLabelText(ru.fields.expression).textContent).toBe('(a < 3) && !b');
      const builder = screen.getByRole('button', { name: ru.condition.builder });
      expect((builder as HTMLButtonElement).disabled).toBe(true);
    });

    it('переключатель «Выражение» показывает текст, «Конструктор» возвращает строки', () => {
      render(<Harness nodeId="cond" />);
      fireEvent.click(screen.getByRole('button', { name: ru.condition.expression }));
      expect(screen.queryByLabelText('Переменная 1')).toBeNull();
      expect(screen.getByLabelText(ru.fields.expression).textContent).toBe('name == "Анна"');
      fireEvent.click(screen.getByRole('button', { name: ru.condition.builder }));
      expect((screen.getByLabelText('Переменная 1') as HTMLInputElement).value).toBe('name');
    });
  });
});
