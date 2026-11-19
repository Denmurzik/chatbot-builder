import type { ReactNode } from 'react';
import { Position, ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ru } from '@/i18n/ru';
import { EditorActionsContext, type EditorActions } from '../actions';
import type { BlockNode as BlockNodeType } from '../convert';
import { BlockNode } from './BlockNode';

// В jsdom у React Flow нет DOM-узла вьюпорта, и NodeToolbar ничего не рисует (портал в него),
// поэтому подменяем его обычной обёрткой: проверяем кнопки, а не позиционирование
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    NodeToolbar: ({ children, isVisible }: { children?: ReactNode; isVisible?: boolean }) =>
      isVisible ? <div data-testid="node-toolbar">{children}</div> : null,
  };
});

function createActions(): EditorActions {
  return {
    openBlock: vi.fn(),
    addFromOutput: vi.fn(),
    insertOnEdge: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
  };
}

function renderBlockNode(
  id: string,
  data: BlockNodeType['data'],
  options: { selected?: boolean; actions?: EditorActions } = {},
) {
  const actions = options.actions ?? createActions();
  const props: NodeProps<BlockNodeType> = {
    id,
    type: 'block',
    data,
    selected: options.selected ?? false,
    dragging: false,
    draggable: true,
    deletable: true,
    selectable: true,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
  const result = render(
    <ReactFlowProvider>
      <EditorActionsContext.Provider value={actions}>
        <BlockNode {...props} />
      </EditorActionsContext.Provider>
    </ReactFlowProvider>,
  );
  return { ...result, actions };
}

describe('BlockNode', () => {
  afterEach(() => {
    cleanup();
  });

  it('у ENTRY_POINT нет ручки входа и нет кнопок «Удалить» и «Дублировать»', () => {
    const { container } = renderBlockNode(
      'entry',
      { type: 'ENTRY_POINT', title: 'Старт' },
      { selected: true },
    );

    expect(container.querySelector('.react-flow__handle.target')).toBeNull();
    expect(container.querySelectorAll('.react-flow__handle.source')).toHaveLength(1);
    expect(container.querySelector('[data-block-shape="start"]')).toBeTruthy();

    expect(screen.queryByRole('button', { name: ru.editor.nodeActions.remove })).toBeNull();
    expect(screen.queryByRole('button', { name: ru.editor.nodeActions.duplicate })).toBeNull();
    expect(screen.getByRole('button', { name: ru.editor.nodeActions.configure })).toBeTruthy();
  });

  it('у EXIT_POINT есть ручка входа слева и нет ручек выходов', () => {
    const { container } = renderBlockNode('exit', { type: 'EXIT_POINT', title: 'Конец' });

    const target = container.querySelector('.react-flow__handle.target');
    expect(target).toBeTruthy();
    expect(target?.className).toContain('left');
    expect(container.querySelectorAll('.react-flow__handle.source')).toHaveLength(0);
    expect(container.querySelector('[data-block-shape="finish"]')).toBeTruthy();
  });

  it('у OPTION_CHOICE с 3 вариантами рисует 3 ручки выходов с подписями и кнопки «+»', () => {
    const { container, actions } = renderBlockNode('opt_1', {
      type: 'OPTION_CHOICE',
      title: 'Выбор',
      question: 'Куда?',
      options: ['Запись', 'Отмена', 'Помощь'],
      variableName: 'choice',
    });

    expect(container.querySelector('.react-flow__handle.target')).toBeTruthy();
    const sources = container.querySelectorAll('.react-flow__handle.source');
    expect(sources).toHaveLength(3);
    expect(screen.getByText('Запись')).toBeTruthy();
    expect(screen.getByText('Отмена')).toBeTruthy();
    expect(screen.getByText('Помощь')).toBeTruthy();
    expect(container.querySelector('[data-block-shape="talk"]')).toBeTruthy();

    const addButtons = screen.getAllByRole('button', { name: ru.editor.addNextBlock });
    expect(addButtons).toHaveLength(3);
    fireEvent.click(addButtons[1]!);
    expect(actions.addFromOutput).toHaveBeenCalledWith('opt_1', 'Отмена');
  });

  it('меню выделенного блока вызывает «Дублировать» и «Удалить»', () => {
    const { actions } = renderBlockNode(
      'msg_1',
      { type: 'TEXT_MESSAGE', title: 'Привет', text: 'Здравствуйте' },
      { selected: true },
    );

    fireEvent.click(screen.getByRole('button', { name: ru.editor.nodeActions.duplicate }));
    expect(actions.duplicate).toHaveBeenCalledWith('msg_1');

    fireEvent.click(screen.getByRole('button', { name: ru.editor.nodeActions.remove }));
    expect(actions.remove).toHaveBeenCalledWith('msg_1');

    fireEvent.click(screen.getByRole('button', { name: ru.editor.nodeActions.configure }));
    expect(actions.openBlock).toHaveBeenCalledWith('msg_1');
  });

  it('назначает формы по категориям: развилка, компактная карточка и интеграция', () => {
    const { container: cond } = renderBlockNode('c1', {
      type: 'CONDITION',
      title: 'Условие',
      expression: 'x > 1',
    });
    expect(cond.querySelector('[data-block-shape="branch"]')).toBeTruthy();
    cleanup();

    const { container: assign } = renderBlockNode('a1', {
      type: 'ASSIGNMENT',
      title: 'Присвоить',
      variableName: 'x',
      expression: '1',
    });
    expect(assign.querySelector('[data-block-shape="compact"]')).toBeTruthy();
    cleanup();

    const { container: http } = renderBlockNode('h1', {
      type: 'HTTP_REQUEST',
      title: 'API',
      method: 'GET',
      url: 'https://example.com',
      headers: [],
      body: '',
      variableName: 'res',
      errorVariable: 'err',
      timeoutSec: 10,
      retryCount: 0,
      retryIntervalSec: 1,
      errorStrategy: 'EXIT_ERROR',
      suspendText: null,
      responseMappings: [],
    });
    expect(http.querySelector('[data-block-shape="integration"]')).toBeTruthy();
  });
});
