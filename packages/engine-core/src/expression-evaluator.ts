import { evaluate } from './expression';
import type { VariableScope } from './scope';
import { extractVariableNames, substitute, type RenderMode } from './template';

// Класс модели BCE для вычисления выражений и подстановки переменных в шаблоны
export class ExpressionEvaluator {
  evaluate(expr: string, scope: VariableScope): string | number | boolean {
    return evaluate(expr, scope);
  }

  extractVariableNames(template: string): string[] {
    return extractVariableNames(template);
  }

  substitute(template: string, values: Record<string, string>, mode: RenderMode): string {
    return substitute(template, values, mode);
  }
}
