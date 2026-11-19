import type { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupCodeMirrorJsdom } from './cm-test-setup';
import { TemplateInput } from './TemplateInput';

beforeAll(() => {
  setupCodeMirrorJsdom();
});

describe('TemplateInput', () => {
  afterEach(() => {
    cleanup();
  });

  it('помечает неизвестную переменную подчёркиванием и подсказкой', () => {
    const { container } = render(
      <TemplateInput
        value="Привет, {{unknown_var}}!"
        onChange={vi.fn()}
        variables={['name']}
        envNames={[]}
      />,
    );

    const unknownPill = container.querySelector('.cm-template-var-unknown');
    expect(unknownPill).not.toBeNull();
    expect(unknownPill?.getAttribute('title')).toBe('переменная не задана выше по сценарию');
    expect(unknownPill?.textContent).toBe('{{unknown_var}}');
    expect(screen.getByText(/переменная не задана выше по сценарию/)).toBeTruthy();
  });

  it('подсвечивает известную переменную как таблетку без пометки ошибки', () => {
    const { container } = render(
      <TemplateInput
        value="Привет, {{name}}!"
        onChange={vi.fn()}
        variables={['name']}
        envNames={[]}
      />,
    );

    const pill = container.querySelector('.cm-template-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('{{name}}');
    expect(container.querySelector('.cm-template-var-unknown')).toBeNull();
  });

  it('разрешает {{env.ИМЯ}} свободно при пустом envNames без пометки ошибки', () => {
    const { container } = render(
      <TemplateInput
        value="Ключ: {{env.API_KEY}}"
        onChange={vi.fn()}
        variables={[]}
        envNames={[]}
      />,
    );

    const pill = container.querySelector('.cm-template-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('{{env.API_KEY}}');
    expect(container.querySelector('.cm-template-var-unknown')).toBeNull();
  });

  it('поддерживает многострочный режим и обновляет значение через view.dispatch', () => {
    const onChange = vi.fn();
    let editorView: EditorView | null = null;

    render(
      <TemplateInput
        value={'Строка 1\nСтрока 2'}
        onChange={onChange}
        variables={['name']}
        envNames={[]}
        multiline
        onCreateEditor={(view) => {
          editorView = view;
        }}
      />,
    );

    expect(editorView).not.toBeNull();
    expect(editorView!.state.doc.lines).toBe(2);

    act(() => {
      editorView!.dispatch({
        changes: { from: editorView!.state.doc.length, insert: ' {{name}}' },
      });
    });

    expect(onChange).toHaveBeenCalledWith('Строка 1\nСтрока 2 {{name}}');
  });

  it('подчёркивание обновляется при смене variables', () => {
    const props = { onChange: vi.fn(), envNames: [], value: 'Привет, {{name}}!' };
    const { container, rerender } = render(<TemplateInput {...props} variables={[]} />);
    expect(container.querySelector('.cm-template-var-unknown')).not.toBeNull();

    rerender(<TemplateInput {...props} variables={['name']} />);
    expect(container.querySelector('.cm-template-var-unknown')).toBeNull();
  });

  it('задаёт ARIA-атрибуты поля', () => {
    const { container } = render(
      <TemplateInput
        value=""
        onChange={vi.fn()}
        variables={[]}
        envNames={[]}
        ariaLabelledBy="lbl"
        multiline
      />,
    );
    const content = container.querySelector('.cm-content') as HTMLElement;
    expect(content.getAttribute('role')).toBe('textbox');
    expect(content.getAttribute('aria-labelledby')).toBe('lbl');
    expect(content.getAttribute('aria-multiline')).toBe('true');
  });
});
