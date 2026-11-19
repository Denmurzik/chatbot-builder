import { autocompletion } from '@codemirror/autocomplete';
import type { Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { TEMPLATE_VAR_REGEX } from '@chatbot/model';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';
import { ru } from '@/i18n/ru';
import { baseSetup, decorationPlugin, fieldTheme, singleLineFilter } from './cm-base';
import { createTemplateCompletionSource } from './completions';

const ENV_PREFIX = 'env.';

// Имена подстановок в шаблоне, которых нет среди доступных переменных (env.* разрешены свободно)
function findUnknownNames(text: string, known: ReadonlySet<string>): string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(new RegExp(TEMPLATE_VAR_REGEX))) {
    const name = match[1];
    if (!name.startsWith(ENV_PREFIX) && !known.has(name)) unknown.add(name);
  }
  return [...unknown];
}

// Подсветка {{…}} «таблетками»; неизвестная переменная подчёркнута с подсказкой
function buildDecorations(doc: string, known: ReadonlySet<string>): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  for (const match of doc.matchAll(new RegExp(TEMPLATE_VAR_REGEX))) {
    const name = match[1];
    const from = match.index ?? 0;
    const isUnknown = !name.startsWith(ENV_PREFIX) && !known.has(name);
    const deco = isUnknown
      ? Decoration.mark({
          class: 'cm-template-pill cm-template-var-unknown',
          attributes: { title: ru.fieldInput.unknownVariable },
        })
      : Decoration.mark({ class: 'cm-template-pill' });
    ranges.push(deco.range(from, from + match[0].length));
  }
  return ranges;
}

export interface TemplateInputProps {
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  envNames: string[];
  multiline?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  // Нужен для тестов и фокусировки
  onCreateEditor?: (view: EditorView) => void;
}

// Поле текста с подстановками {{переменная}} и подсказками
export function TemplateInput({
  value,
  onChange,
  variables,
  envNames,
  multiline = false,
  placeholder,
  id,
  ariaLabel,
  ariaLabelledBy,
  onCreateEditor,
}: TemplateInputProps) {
  const variablesKey = variables.join('\u0000');
  const envKey = envNames.join('\u0000');
  const extensions = useMemo(
    () => [
      EditorView.contentAttributes.of({
        role: 'textbox',
        'aria-multiline': multiline ? 'true' : 'false',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
        ...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : {}),
      }),
      fieldTheme(multiline),
      ...(multiline ? [EditorView.lineWrapping] : [singleLineFilter]),
      autocompletion({ override: [createTemplateCompletionSource(variables, envNames)] }),
      decorationPlugin((doc) => buildDecorations(doc, new Set(variables))),
    ],
    // Массивы variables/envNames сравниваются по содержимому через ключи, а не по ссылке:
    // иначе расширения пересоздавались бы при каждом рендере родителя
    [variablesKey, envKey, multiline, ariaLabel, ariaLabelledBy],
  );

  const unknown = findUnknownNames(value, new Set(variables));

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
      {unknown.length > 0 && (
        <p className="mt-1 text-xs text-destructive">
          {ru.fieldInput.unknownVariable}: {unknown.join(', ')}
        </p>
      )}
    </div>
  );
}
