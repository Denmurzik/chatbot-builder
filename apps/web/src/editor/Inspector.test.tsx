import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_META } from './block-meta';
import type { BlockNode } from './convert';
import { Inspector } from './Inspector';

function makeNode(data: BlockNode['data']): BlockNode {
  return { id: 'n1', type: 'block', position: { x: 0, y: 0 }, data };
}

function httpData(method: 'GET' | 'POST', retryCount: number): BlockNode['data'] {
  const base = BLOCK_META.HTTP_REQUEST.defaults();
  if (base.type !== 'HTTP_REQUEST') throw new Error('ожидался HTTP_REQUEST');
  return { ...base, method, retryCount };
}

describe('Inspector', () => {
  afterEach(cleanup);

  it('предупреждение о повторах показано для POST с retryCount > 0', () => {
    render(<Inspector node={makeNode(httpData('POST', 2))} onChange={vi.fn()} />);
    expect(screen.getByText(/Повторы для POST, PUT и PATCH небезопасны/)).toBeTruthy();
  });

  it('предупреждения нет для GET и для POST без повторов', () => {
    const { rerender } = render(
      <Inspector node={makeNode(httpData('GET', 2))} onChange={vi.fn()} />,
    );
    expect(screen.queryByText(/Повторы для POST/)).toBeNull();
    rerender(<Inspector node={makeNode(httpData('POST', 0))} onChange={vi.fn()} />);
    expect(screen.queryByText(/Повторы для POST/)).toBeNull();
  });

  it('повторяющийся вариант показывает ошибку рядом с полем', () => {
    const data = BLOCK_META.OPTION_CHOICE.defaults();
    render(<Inspector node={makeNode(data)} onChange={vi.fn()} />);
    const field = screen.getByDisplayValue(/Да/);
    fireEvent.change(field, { target: { value: 'Да\nДа' } });
    expect(screen.getByText('Повторяющееся значение: «Да»')).toBeTruthy();
  });

  it('значение «else» в переключателе показывает ошибку', () => {
    const data = BLOCK_META.SWITCH.defaults();
    render(<Inspector node={makeNode(data)} onChange={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue(/значение1/), { target: { value: 'else' } });
    expect(screen.getByText('Значение «else» зарезервировано')).toBeTruthy();
  });

  it('тайм-аут 0 показывает ошибку', () => {
    const data = { ...httpData('GET', 0), timeoutSec: 0 } as BlockNode['data'];
    render(<Inspector node={makeNode(data)} onChange={vi.fn()} />);
    expect(screen.getByText('Значение должно быть не меньше 1')).toBeTruthy();
  });

  it('числовое поле можно очистить', () => {
    render(<Inspector node={makeNode(httpData('GET', 0))} onChange={vi.fn()} />);
    const input = screen.getByDisplayValue('10') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });
});
