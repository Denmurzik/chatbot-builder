import { TEMPLATE_VAR_REGEX, extractVariableNames } from '@chatbot/model';
import type { VariableScope } from './scope';

// Режим экранирования подставляемых значений в шаблоне (п. 2.4)
export type RenderMode = 'TEXT' | 'URL' | 'HEADER' | 'JSON';

const ENV_PREFIX = 'env.';

export { extractVariableNames };

// Экранирует значение в зависимости от места подстановки
function escapeValue(value: string, mode: RenderMode): string {
  switch (mode) {
    case 'TEXT':
      return value;
    case 'URL':
      // Одиночные суррогаты заменяются на U+FFFD, иначе encodeURIComponent бросает URIError
      return encodeURIComponent(
        value.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd'),
      );
    case 'HEADER':
      // Удаляем переводы строк для защиты от внедрения HTTP-заголовков
      return value.replace(/[\r\n]+/g, '');
    case 'JSON':
      // Экранируем как содержимое JSON-строки (без внешних кавычек)
      return JSON.stringify(value).slice(1, -1);
  }
}

// Подставляет значения в шаблон за один проход слева направо (подставленный текст не разбирается повторно)
export function substitute(
  template: string,
  values: Record<string, string>,
  mode: RenderMode,
  rawNames: ReadonlySet<string> = new Set(),
): string {
  return template.replace(TEMPLATE_VAR_REGEX, (_match, name: string) => {
    const raw = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : '';
    return rawNames.has(name) ? raw : escapeValue(raw, mode);
  });
}

// Подставляет переменные диалога и окружения из области видимости в шаблон
export function render(template: string, scope: VariableScope, mode: RenderMode): string {
  const names = extractVariableNames(template);
  const values: Record<string, string> = Object.create(null) as Record<string, string>;

  for (const name of names) {
    if (name.startsWith(ENV_PREFIX)) {
      const envName = name.slice(ENV_PREFIX.length);
      values[name] = scope.getEnv(envName) ?? '';
    } else {
      values[name] = scope.get(name) ?? '';
    }
  }

  // В режиме URL значения env.* подставляются как есть: это база адреса, задаваемая автором (п. 2.4)
  const rawNames = new Set(mode === 'URL' ? names.filter((n) => n.startsWith(ENV_PREFIX)) : []);
  return substitute(template, values, mode, rawNames);
}
