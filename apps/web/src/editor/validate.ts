import { ru } from '@/i18n/ru';
import type { BlockNode } from './convert';

// Проверка списка строк (варианты / значения): пустые, повторы, зарезервированные значения
export function listIssues(lines: string[], forbidden: readonly string[] = []): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const reported = new Set<string>();
  let hasValue = false;
  let hasBlank = false;
  for (const line of lines) {
    if (line.trim() === '') {
      hasBlank = true;
      continue;
    }
    hasValue = true;
    if (forbidden.includes(line) && !reported.has(`r:${line}`)) {
      reported.add(`r:${line}`);
      issues.push(ru.validation.reserved(line));
    }
    if (seen.has(line) && !reported.has(`d:${line}`)) {
      reported.add(`d:${line}`);
      issues.push(ru.validation.duplicate(line));
    }
    seen.add(line);
  }
  if (hasBlank) issues.push(ru.validation.emptyLine);
  if (!hasValue) issues.push(ru.validation.listEmpty);
  return issues;
}

export function minIssue(value: number, min: number): string | null {
  return value < min ? ru.validation.min(min) : null;
}

// Ошибки данных блока, блокирующие сохранение
export function nodeIssues(node: BlockNode): string[] {
  const data = node.data;
  switch (data.type) {
    case 'OPTION_CHOICE':
      return listIssues(data.options);
    case 'SWITCH':
      return listIssues(data.values, ['else']);
    case 'HTTP_REQUEST':
      return [
        minIssue(data.timeoutSec, 1),
        minIssue(data.retryCount, 0),
        minIssue(data.retryIntervalSec, 0),
      ].filter((issue): issue is string => issue !== null);
    default:
      return [];
  }
}
