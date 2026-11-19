import { EditorState, Transaction, type ChangeSpec, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

// Тема в токенах shadcn: работает и в светлой, и в тёмной теме через CSS-переменные
export function fieldTheme(multiline: boolean): Extension {
  return EditorView.theme({
    '&': {
      minHeight: multiline ? '5rem' : '2.25rem',
      border: '1px solid var(--input)',
      borderRadius: 'calc(var(--radius) - 2px)',
      backgroundColor: 'transparent',
      color: 'var(--foreground)',
      fontSize: '0.875rem',
    },
    '&.cm-focused': {
      outline: 'none',
      borderColor: 'var(--ring)',
      boxShadow: '0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)',
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      lineHeight: '1.5',
      overflowX: multiline ? 'hidden' : 'auto',
    },
    '.cm-content': { padding: '0.4rem 0.25rem', caretColor: 'var(--foreground)' },
    '.cm-line': { padding: '0 0.5rem' },
    '.cm-placeholder': { color: 'var(--muted-foreground)' },
    '.cm-template-pill': {
      backgroundColor: 'var(--muted)',
      border: '1px solid var(--border)',
      borderRadius: '9999px',
      padding: '0 0.35rem',
      color: 'var(--foreground)',
    },
    '.cm-template-var-unknown': {
      textDecoration: 'underline wavy var(--destructive)',
      textUnderlineOffset: '3px',
    },
    '.cm-expr-op': { color: 'var(--muted-foreground)', fontWeight: '600' },
    '.cm-expr-number, .cm-expr-keyword': { color: 'var(--chart-1, var(--primary))' },
    '.cm-expr-string': { color: 'var(--chart-2, var(--primary))' },
    '.cm-tooltip': {
      border: '1px solid var(--border)',
      backgroundColor: 'var(--popover)',
      color: 'var(--popover-foreground)',
      borderRadius: 'calc(var(--radius) - 2px)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--accent)',
      color: 'var(--accent-foreground)',
    },
    '.cm-completionDetail': { marginLeft: '0.75rem', fontStyle: 'normal', opacity: '0.7' },
  });
}

// Однострочное поле: переводы строки во вставляемом тексте заменяются пробелами.
// Длина вставки сохраняется (CRLF считается одним переводом строки), поэтому выделение остаётся валидным
export const singleLineFilter: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  let hasNewline = false;
  const changes: ChangeSpec[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (inserted.lines > 1) hasNewline = true;
    changes.push({ from: fromA, to: toA, insert: inserted.sliceString(0, undefined, ' ') });
  });
  if (!hasNewline) return tr;
  return {
    changes,
    selection: tr.selection,
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    userEvent: tr.annotation(Transaction.userEvent),
  };
});

// Плагин подсветки: функция возвращает размеченные диапазоны для всего документа
export function decorationPlugin(build: (doc: string) => Range<Decoration>[]): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = Decoration.set(build(view.state.doc.toString()), true);
      }
      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = Decoration.set(build(update.state.doc.toString()), true);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

// Параметры базовой настройки @uiw/react-codemirror: без гуттеров и подсветки строки
export const baseSetup = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  autocompletion: false,
  indentOnInput: false,
  closeBrackets: false,
} as const;
