import {
  MapScope,
  ExpressionError,
  evaluate,
  parseExpression,
  render,
  toBoolean,
} from '@chatbot/engine-core';
import { TEMPLATE_VAR_REGEX } from '@chatbot/model';
import { ru } from '@/i18n/ru';
import { referencedNames } from './highlight';

const t = ru.fieldInput;

// template — текст с {{переменными}}; value — выражение; condition — выражение Условия (да/нет и выход)
export type ResultKind = 'template' | 'value' | 'condition';

export interface ResultPart {
  text: string;
  // Часть подставлена из тестового значения
  substituted?: boolean;
  // Для переменной нет тестового значения
  missing?: boolean;
}

export interface ComputedResult {
  parts: ResultPart[];
  // Итоговый текст (без пометок)
  text: string;
  error?: string;
  // Имена без тестового значения (для выражения: вычисление пропущено)
  missingNames: string[];
  // Для condition — выход, который сработает: yes | no
  branch?: 'yes' | 'no';
}

function hasOwn(values: Record<string, string>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, name);
}

function errorText(error: unknown): string {
  return error instanceof ExpressionError ? error.message : t.expressionErrorGeneric;
}

function computeTemplate(text: string, testValues: Record<string, string>): ComputedResult {
  const parts: ResultPart[] = [];
  const missingNames: string[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(TEMPLATE_VAR_REGEX))) {
    const from = match.index ?? 0;
    if (from > last) parts.push({ text: text.slice(last, from) });
    const name = match[1];
    if (hasOwn(testValues, name)) parts.push({ text: testValues[name], substituted: true });
    else {
      parts.push({ text: '', missing: true });
      missingNames.push(name);
    }
    last = from + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return {
    parts,
    text: render(text, new MapScope(testValues, {}), 'TEXT'),
    missingNames,
  };
}

function computeExpression(
  kind: 'value' | 'condition',
  text: string,
  testValues: Record<string, string>,
): ComputedResult {
  // Синтаксическая ошибка важнее отсутствующих тестовых значений
  try {
    parseExpression(text);
  } catch (error) {
    return { parts: [], text: '', missingNames: [], error: errorText(error) };
  }
  const missingNames = referencedNames(text).filter((name) => !hasOwn(testValues, name));
  if (missingNames.length > 0) return { parts: [], text: '', missingNames };
  try {
    const value = evaluate(text, new MapScope(testValues, {}));
    const shown = typeof value === 'boolean' ? (value ? t.resultYes : t.resultNo) : String(value);
    return {
      parts: [{ text: shown, substituted: true }],
      text: shown,
      missingNames,
      ...(kind === 'condition'
        ? { branch: toBoolean(value) ? ('yes' as const) : ('no' as const) }
        : {}),
    };
  } catch (error) {
    return { parts: [], text: '', missingNames, error: errorText(error) };
  }
}

// Живое значение поля по тестовым значениям из колонки «Вход»
export function computeResult(
  kind: ResultKind,
  text: string,
  testValues: Record<string, string>,
): ComputedResult {
  if (kind === 'template') return computeTemplate(text, testValues);
  if (text.trim() === '') return { parts: [], text: '', missingNames: [] };
  return computeExpression(kind, text, testValues);
}

interface ResultViewProps {
  kind: ResultKind;
  value: string;
  testValues: Record<string, string>;
  // Строка-подсказка под результатом
  showTip?: boolean;
}

// Тело «Результата»: используется и во всплывающем окне, и в большом редакторе
export function ResultView({ kind, value, testValues, showTip = true }: ResultViewProps) {
  const result = computeResult(kind, value, testValues);
  const empty = value.trim() === '';
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t.result}
      </div>
      {result.error ? (
        <p role="alert" className="text-destructive">
          {t.expressionError}: {result.error}
        </p>
      ) : kind !== 'template' && result.missingNames.length > 0 ? (
        <p className="text-muted-foreground">{t.noTestValueFor(result.missingNames.join(', '))}</p>
      ) : (
        <div
          data-testid="result-value"
          className="rounded-md border bg-muted/40 px-2 py-1 font-mono break-words whitespace-pre-wrap"
        >
          {empty ? (
            <span className="text-muted-foreground">{t.resultEmpty}</span>
          ) : (
            result.parts.map((part, index) =>
              part.missing ? (
                <span key={index} className="cm-result-missing text-muted-foreground italic">
                  {t.noTestValue}
                </span>
              ) : part.substituted ? (
                <span
                  key={index}
                  className="cm-result-sub rounded-sm bg-primary/15 px-0.5 text-primary"
                >
                  {part.text}
                </span>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )
          )}
        </div>
      )}
      {result.branch && (
        <p className="text-muted-foreground">
          {t.branch(result.branch === 'yes' ? ru.outputs.yes : ru.outputs.no)}
        </p>
      )}
      {showTip && (
        <p className="text-xs text-muted-foreground">
          {kind === 'template' ? t.tipTemplate : t.tipExpression}
        </p>
      )}
    </div>
  );
}

interface ResultPopoverProps extends ResultViewProps {
  className?: string;
}

// Всплывающее «Результат» под полем в фокусе
export function ResultPopover({ className = '', ...props }: ResultPopoverProps) {
  return (
    <div
      className={`absolute top-full right-0 left-0 z-30 mt-1 rounded-md border bg-popover p-3 text-popover-foreground shadow-md ${className}`}
    >
      <ResultView {...props} />
    </div>
  );
}
