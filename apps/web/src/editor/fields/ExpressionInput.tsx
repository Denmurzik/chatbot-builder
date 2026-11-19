import { autocompletion } from '@codemirror/autocomplete';
import { Decoration, EditorView } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import { parseExpression } from '@chatbot/engine-core';
import CodeMirror from '@uiw/react-codemirror';
import { useEffect, useMemo, useState } from 'react';
import { ru } from '@/i18n/ru';
import { baseSetup, decorationPlugin, fieldTheme, singleLineFilter } from './cm-base';
import { createExpressionCompletionSource } from './completions';

// Задержка показа ошибки разбора, мс
const ERROR_DELAY_MS = 300;

// Лексемы выражения: ссылка на env, строка, число, идентификатор, оператор
const TOKEN_REGEX =
  /\{\{\s*env\.[A-Za-z_][A-Za-z0-9_]*\s*\}\}|'(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|&&|\|\||[<>!+\-*/%]/g;

const mark = (cls: string, from: number, to: number): Range<Decoration> =>
  Decoration.mark({ class: cls }).range(from, to);

// Подсветка синтаксиса: переменные и env — «таблетки», литералы и операторы — цветом
function buildDecorations(doc: string, variables: ReadonlySet<string>): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  for (const match of doc.matchAll(TOKEN_REGEX)) {
    const text = match[0];
    const from = match.index ?? 0;
    const to = from + text.length;
    if (text.startsWith('{{')) ranges.push(mark('cm-template-pill', from, to));
    else if (text[0] === "'" || text[0] === '"') ranges.push(mark('cm-expr-string', from, to));
    else if (/^\d/.test(text)) ranges.push(mark('cm-expr-number', from, to));
    else if (text === 'true' || text === 'false') ranges.push(mark('cm-expr-keyword', from, to));
    else if (/^[A-Za-z_]/.test(text)) {
      if (variables.has(text)) ranges.push(mark('cm-template-pill', from, to));
    } else ranges.push(mark('cm-expr-op', from, to));
  }
  return ranges;
}

// Текст ошибки разбора на русском
function errorMessage(value: string): string | null {
  if (value.trim().length === 0) return null;
  try {
    parseExpression(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : ru.common.unknownError;
  }
}

export interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  envNames: string[];
  placeholder?: string;
  id?: string;
  // Нужен для тестов и фокусировки
  onCreateEditor?: (view: EditorView) => void;
}

// Однострочное поле выражения с подсказками и проверкой синтаксиса
export function ExpressionInput({
  value,
  onChange,
  variables,
  envNames,
  placeholder,
  id,
  onCreateEditor,
}: ExpressionInputProps) {
  const [error, setError] = useState<string | null>(null);

  // Ошибка показывается с задержкой, чтобы не мигать во время набора
  useEffect(() => {
    const timer = setTimeout(() => setError(errorMessage(value)), ERROR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const variablesKey = variables.join('\u0000');
  const envKey = envNames.join('\u0000');
  const extensions = useMemo(
    () => [
      fieldTheme(false),
      singleLineFilter,
      autocompletion({ override: [createExpressionCompletionSource(variables, envNames)] }),
      decorationPlugin((doc) => buildDecorations(doc, new Set(variables))),
    ],
    // Массивы сравниваются по содержимому (через ключи)
    [variablesKey, envKey],
  );

  return (
    <div>
      <CodeMirror
        id={id}
        value={value}
        onChange={(next) => onChange(next)}
        extensions={extensions}
        theme="none"
        basicSetup={baseSetup}
        placeholder={placeholder}
        onCreateEditor={onCreateEditor}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {ru.fieldInput.expressionError}: {error}
        </p>
      )}
    </div>
  );
}
