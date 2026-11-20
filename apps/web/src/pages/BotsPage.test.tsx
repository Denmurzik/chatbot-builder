import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BotView } from '@chatbot/model';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ru } from '@/i18n/ru';
import { BotsPage } from './BotsPage';

const bot: BotView = {
  id: 'b1',
  name: 'Мой бот',
  status: 'CREATED',
  publishedAt: null,
  connections: [],
  environment: [],
};

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Мок fetch: GET списка ботов отдаёт bot, остальные запросы — по таблице ответов
function stubApi(routes: Record<string, Response>, list: BotView[] = [bot]) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return json(200, list);
    const key = `${method} ${url}`;
    const response = routes[key];
    if (!response) throw new Error(`нет мока для ${key}`);
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/p1/bots']}>
        <Routes>
          <Route path="/projects/:id/bots" element={<BotsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BotsPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('409 токена показывается под полем', async () => {
    stubApi({
      'PUT /api/projects/p1/bots/b1/connections/telegram': json(409, {
        message: ru.bots.tokenTaken,
      }),
    });
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByLabelText(ru.bots.tokenLabel);
    expect(field.getAttribute('type')).toBe('password');
    await user.type(field, '123:abc');
    await user.click(screen.getByRole('button', { name: ru.bots.tokenConnect }));
    expect(await screen.findByText(ru.bots.tokenTaken)).toBeTruthy();
  });

  it('422 публикации показывает список ошибок', async () => {
    stubApi({
      'POST /api/projects/p1/bots/b1/publish': json(422, {
        message: 'Unprocessable Entity',
        errors: [{ rule: 'R1', message: 'Нет стартового блока', severity: 'ERROR' }],
      }),
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: ru.bots.publish }));
    expect(await screen.findByText('Нет стартового блока')).toBeTruthy();
  });

  it('удаление бота требует подтверждения в диалоге', async () => {
    const fetchMock = stubApi({ 'DELETE /api/projects/p1/bots/b1': json(204) });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: ru.bots.delete }));
    const dialog = await screen.findByRole('dialog');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: ru.bots.delete }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true),
    );
  });
});
