import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

describe('EditorPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('отрисовывает три колонки и загруженный блок', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'p1',
              name: 'Запись к врачу',
              scenario: emptyScenario(),
              updatedAt: '2026-01-01T00:00:00Z',
            }),
            { status: 200 },
          ),
        ),
      ),
    );

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/projects/p1']}>
          <Routes>
            <Route path="/projects/:id" element={<EditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Запись к врачу')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Сохранить/ })).toBeTruthy();
    expect(screen.getByLabelText('Блоки')).toBeTruthy();
    expect(screen.getByLabelText('Свойства блока')).toBeTruthy();
    expect(screen.getByText('Старт')).toBeTruthy();
    expect(screen.getByText('Выберите блок на холсте, чтобы изменить его свойства')).toBeTruthy();
  });
});
