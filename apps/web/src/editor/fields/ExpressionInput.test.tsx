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

  it('не вызывает onChange при монтировании', () => {
    const onChange = vi.fn();
    render(<ExpressionInput value="a" onChange={onChange} variables={['a']} envNames={[]} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('внешнее изменение value обновляет документ без вызова onChange', () => {
    const onChange = vi.fn();
    let view: EditorView | null = null;
    const props = {
      onChange,
      variables: ['a'],
      envNames: [],
      onCreateEditor: (v: EditorView) => {
        view = v;
      },
    };
    const { rerender } = render(<ExpressionInput value="a" {...props} />);
    rerender(<ExpressionInput value="a + 1" {...props} />);
    expect(view!.state.doc.toString()).toBe('a + 1');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ошибка исчезает после исправления выражения', () => {
    vi.useFakeTimers();
    const props = { onChange: vi.fn(), variables: ['a'], envNames: [] };
    const { rerender } = render(<ExpressionInput value="a +" {...props} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('alert')).not.toBeNull();

    rerender(<ExpressionInput value="a + 1" {...props} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('вставка с переводом строки превращается в «a b», документ остаётся однострочным', () => {
    let view: EditorView | null = null;
    render(
      <ExpressionInput
        value=""
        onChange={vi.fn()}
        variables={[]}
        envNames={[]}
        onCreateEditor={(v) => {
          view = v;
        }}
      />,
    );
    act(() => {
      view!.dispatch({ changes: { from: 0, insert: 'a\nb' } });
    });
    expect(view!.state.doc.toString()).toBe('a b');
    expect(view!.state.doc.lines).toBe(1);
  });

  it('Enter не добавляет строку', () => {
    let view: EditorView | null = null;
    const { container } = render(
      <ExpressionInput
        value="a"
        onChange={vi.fn()}
        variables={['a']}
        envNames={[]}
        onCreateEditor={(v) => {
          view = v;
        }}
      />,
    );
    const content = container.querySelector('.cm-content') as HTMLElement;
    act(() => {
      content.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }),
      );
    });
    expect(view!.state.doc.lines).toBe(1);
  });

  it('задаёт ARIA-атрибуты поля и связь с ошибкой', () => {
    vi.useFakeTimers();
    const { container } = render(
      <ExpressionInput
        id="expr"
        value="a +"
        onChange={vi.fn()}
        variables={['a']}
        envNames={[]}
        ariaLabel="Условие"
      />,
    );
    const content = container.querySelector('.cm-content') as HTMLElement;
    expect(content.getAttribute('role')).toBe('textbox');
    expect(content.getAttribute('aria-multiline')).toBe('false');
    expect(content.getAttribute('aria-label')).toBe('Условие');
    expect(content.getAttribute('aria-invalid')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    const alert = screen.getByRole('alert');
    expect(content.getAttribute('aria-invalid')).toBe('true');
    expect(content.getAttribute('aria-describedby')).toBe(alert.id);
  });
});
