import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { emptyScenario, type Scenario } from '@chatbot/model';
import { ru } from '@/i18n/ru';
import { createQueryClient } from '@/app/queryClient';
import { EditorPage } from './EditorPage';

// jsdom не содержит ResizeObserver и DOMMatrixReadOnly, нужных React Flow
beforeAll(() => {
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m22 = 1;
      constructor(_transform?: string) {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

// GET проекта отдаёт пустой сценарий, PUT сценария — успех
function stubFetch(scenario: Scenario = emptyScenario()) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'PUT'
        ? new Response(JSON.stringify({ updatedAt: '2026-01-02T00:00:00Z' }), { status: 200 })
        : new Response(
            JSON.stringify({
              id: 'p1',
              name: 'Запись к врачу',
              scenario,
              updatedAt: '2026-01-01T00:00:00Z',
            }),
            { status: 200 },
          ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// useBlocker требует роутер с данными
function renderEditor() {
  const router = createMemoryRouter([{ path: '/projects/:id', element: <EditorPage /> }], {
    initialEntries: ['/projects/p1'],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('EditorPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('отрисовывает три колонки и загруженный блок', async () => {
    stubFetch();
    renderEditor();

    expect(await screen.findByText('Запись к врачу')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Сохранить/ })).toBeTruthy();
    expect(screen.getByLabelText('Блоки')).toBeTruthy();
    expect(screen.getByLabelText('Свойства блока')).toBeTruthy();
    expect(screen.getByText('Старт')).toBeTruthy();
    expect(screen.getByText('Выберите блок на холсте, чтобы изменить его свойства')).toBeTruthy();
  });

  it('Ctrl+S по code KeyS (русская раскладка, key «ы») сохраняет сценарий', async () => {
    const fetchMock = stubFetch();
    renderEditor();
    await screen.findByRole('button', { name: /Сохранить/ });

    fireEvent.keyDown(window, { key: 'ы', code: 'KeyS', ctrlKey: true });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/projects/p1/scenario' && init?.method === 'PUT',
        ),
      ).toBe(true),
    );
  });

  describe('меню блока', () => {
    const scenario: Scenario = {
      formatVersion: 1,
      blocks: [
        { id: 'entry', type: 'ENTRY_POINT', title: 'Старт', x: 0, y: 0 },
        { id: 'msg_1', type: 'TEXT_MESSAGE', title: 'Привет', text: 'Здравствуйте', x: 100, y: 60 },
      ],
      transitions: [{ source: { blockId: 'entry', output: 'default' }, target: 'msg_1' }],
    };

    // Сохраняем сценарий по Ctrl+S и возвращаем отправленное тело
    async function savedScenario(fetchMock: ReturnType<typeof stubFetch>): Promise<Scenario> {
      fireEvent.keyDown(window, { key: 's', code: 'KeyS', ctrlKey: true });
      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true),
      );
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!;
      return JSON.parse(String(call[1]!.body)) as Scenario;
    }

    it('«Дублировать» создаёт копию с новым id, сдвигом 40 по сетке, без связей и выделяет её', async () => {
      const fetchMock = stubFetch(scenario);
      renderEditor();
      fireEvent.click(await screen.findByText('Привет'));

      fireEvent.click(await screen.findByRole('button', { name: ru.editor.nodeActions.duplicate }));

      const saved = await savedScenario(fetchMock);
      expect(saved.blocks).toHaveLength(3);
      const copy = saved.blocks.find((b) => b.id !== 'entry' && b.id !== 'msg_1')!;
      expect(copy.type).toBe('TEXT_MESSAGE');
      expect(copy.x).toBe(140);
      expect(copy.y).toBe(100);
      expect(copy.x % 20).toBe(0);
      expect(copy.y % 20).toBe(0);
      // Связей столько же: у копии их нет
      expect(saved.transitions).toHaveLength(1);
      // Выделена только копия
      const selected = document.querySelectorAll('.react-flow__node.selected');
      expect(selected).toHaveLength(1);
      expect(selected[0]!.getAttribute('data-id')).toBe(copy.id);
    });

    it('у «Точки входа» нет «Дублировать» и «Удалить»: сценарий не меняется', async () => {
      const fetchMock = stubFetch(scenario);
      renderEditor();
      fireEvent.click(await screen.findByText('Старт'));

      await screen.findByRole('button', { name: ru.editor.nodeActions.configure });
      expect(screen.queryByRole('button', { name: ru.editor.nodeActions.duplicate })).toBeNull();
      expect(screen.queryByRole('button', { name: ru.editor.nodeActions.remove })).toBeNull();

      const saved = await savedScenario(fetchMock);
      expect(saved.blocks).toHaveLength(2);
      expect(saved.transitions).toHaveLength(1);
    });
  });
});
