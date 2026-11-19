import type { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupCodeMirrorJsdom } from './cm-test-setup';
import { ExpressionInput } from './ExpressionInput';

beforeAll(() => {
  setupCodeMirrorJsdom();
});

describe('ExpressionInput', () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('показывает ошибку на «a +» после задержки 300 мс', () => {
    vi.useFakeTimers();
    render(<ExpressionInput value="a +" onChange={vi.fn()} variables={['a']} envNames={[]} />);

    // До истечения 300 мс ошибка ещё не показана
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/[А-Яа-яЁё]/);
  });

  it('не показывает ошибку на корректном выражении «tries < 3»', () => {
    vi.useFakeTimers();
    render(
      <ExpressionInput value="tries < 3" onChange={vi.fn()} variables={['tries']} envNames={[]} />,
    );

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('не показывает ошибку на пустом выражении', () => {
    vi.useFakeTimers();
    render(<ExpressionInput value="" onChange={vi.fn()} variables={['tries']} envNames={[]} />);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('разрешает {{env.ИМЯ}} даже при пустом envNames', () => {
    vi.useFakeTimers();
    render(
      <ExpressionInput
        value="{{env.API_KEY}} != ''"
        onChange={vi.fn()}
        variables={[]}
        envNames={[]}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('вызывает onChange при изменении документа через view.dispatch', () => {
    const onChange = vi.fn();
    let editorView: EditorView | null = null;

    render(
      <ExpressionInput
        value="tries < 3"
        onChange={onChange}
        variables={['tries']}
        envNames={[]}
        onCreateEditor={(view) => {
          editorView = view;
        }}
      />,
    );

    expect(editorView).not.toBeNull();
    act(() => {
      editorView!.dispatch({
        changes: { from: 0, to: editorView!.state.doc.length, insert: 'tries == 5' },
      });
    });

    expect(onChange).toHaveBeenCalledWith('tries == 5');
  });
});
