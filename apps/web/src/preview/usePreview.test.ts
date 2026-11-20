import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewEvent } from '@chatbot/model';
import { usePreview } from './usePreview';

type Listener = (...args: unknown[]) => void;

class MockSocket {
  private listeners = new Map<string, Set<Listener>>();
  emit = vi.fn();
  disconnect = vi.fn();

  on(event: string, listener: Listener) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

let currentSocket: MockSocket;
const ioMock = vi.fn((..._args: unknown[]) => {
  currentSocket = new MockSocket();
  return currentSocket;
});

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => ioMock(...args),
}));

describe('usePreview', () => {
  beforeEach(() => {
    ioMock.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('подключается к /preview с path /api/socket.io и withCredentials, сохраняет sessionId и отключается при закрытии', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => usePreview({ projectId: 'proj-1', enabled }),
      { initialProps: { enabled: true } },
    );

    expect(ioMock).toHaveBeenCalledWith('/preview', {
      path: '/api/socket.io',
      withCredentials: true,
    });
    expect(result.current.status).toBe('connecting');

    act(() => {
      currentSocket.trigger('connect');
    });

    expect(currentSocket.emit).toHaveBeenCalledWith(
      'start',
      { projectId: 'proj-1' },
      expect.any(Function),
    );

    const ack = currentSocket.emit.mock.calls[0]![2] as (res: { chatId: string }) => void;
    act(() => {
      ack({ chatId: 'preview:proj-1:sess-42' });
    });

    expect(result.current.status).toBe('connected');
    expect(sessionStorage.getItem('preview-session:proj-1')).toBe('sess-42');

    // Закрытие панели отключает сокет
    rerender({ enabled: false });
    expect(currentSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  it('передаёт сохранённый sessionId при повторном открытии превью', () => {
    sessionStorage.setItem('preview-session:proj-1', 'saved-sess');

    renderHook(() => usePreview({ projectId: 'proj-1', enabled: true }));

    act(() => {
      currentSocket.trigger('connect');
    });

    expect(currentSocket.emit).toHaveBeenCalledWith(
      'start',
      { projectId: 'proj-1', sessionId: 'saved-sess' },
      expect.any(Function),
    );
  });

  it('обрабатывает input, button, restart и события message/question/system/currentBlock/variables', () => {
    const onCurrentBlock = vi.fn();
    const onErrorBlock = vi.fn();

    const { result } = renderHook(() =>
      usePreview({
        projectId: 'proj-1',
        enabled: true,
        onCurrentBlock,
        onErrorBlock,
      }),
    );

    act(() => {
      currentSocket.trigger('connect');
      const ack = currentSocket.emit.mock.calls[0]![2] as (res: { chatId: string }) => void;
      ack({ chatId: 'preview:proj-1:s1' });
    });

    // Входящие события от сервера
    const events: PreviewEvent[] = [
      { type: 'message', message: { kind: 'text', text: 'Привет!' } },
      {
        type: 'message',
        message: {
          kind: 'question',
          text: 'Выберите врача',
          buttons: [{ label: 'Терапевт', callbackData: 'opt_1:0' }],
        },
      },
      { type: 'currentBlock', blockId: 'opt_1' },
      { type: 'variables', variables: { name: 'Аня' } },
      { type: 'system', text: 'Выход не подключён', blockId: 'msg_2' },
    ];

    act(() => {
      for (const ev of events) {
        currentSocket.trigger('preview', ev);
      }
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[0]).toMatchObject({ role: 'bot', kind: 'text', text: 'Привет!' });
    expect(result.current.messages[1]).toMatchObject({
      role: 'bot',
      kind: 'question',
      text: 'Выберите врача',
    });
    expect(result.current.messages[2]).toMatchObject({
      role: 'system',
      text: 'Выход не подключён',
      blockId: 'msg_2',
    });
    expect(result.current.variables).toEqual({ name: 'Аня' });
    expect(onCurrentBlock).toHaveBeenCalledWith('opt_1');
    expect(onErrorBlock).toHaveBeenCalledWith('msg_2');

    // Отправка текстового ввода
    act(() => {
      result.current.sendInput('Иван');
    });
    expect(currentSocket.emit).toHaveBeenCalledWith(
      'input',
      { text: 'Иван' },
      expect.any(Function),
    );
    expect(result.current.messages[3]).toMatchObject({ role: 'user', text: 'Иван' });

    // Нажатие кнопки
    act(() => {
      result.current.pressButton({ label: 'Терапевт', callbackData: 'opt_1:0' });
    });
    expect(currentSocket.emit).toHaveBeenCalledWith(
      'button',
      { callbackData: 'opt_1:0' },
      expect.any(Function),
    );

    // Перезапуск очищает чат и шлёт restart
    act(() => {
      result.current.restart();
    });
    expect(currentSocket.emit).toHaveBeenCalledWith('restart', expect.any(Function));
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.variables).toEqual({});
  });
});
