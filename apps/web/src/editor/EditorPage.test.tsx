import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { emptyScenario } from '@chatbot/model';
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
function stubFetch() {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'PUT'
        ? new Response(JSON.stringify({ updatedAt: '2026-01-02T00:00:00Z' }), { status: 200 })
        : new Response(
            JSON.stringify({
              id: 'p1',
              name: 'Запись к врачу',
              scenario: emptyScenario(),
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
});
