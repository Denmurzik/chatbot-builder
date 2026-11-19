// Точка входа пакета @chatbot/engine-core
export { MapScope, type VariableScope } from './scope';
export { extractVariableNames, render, substitute, type RenderMode } from './template';
export { ExpressionError, evaluate, parseExpression, toBoolean } from './expression';
export { ExpressionEvaluator } from './expression-evaluator';
export { extract, parseJsonPath, toText } from './json-path';
