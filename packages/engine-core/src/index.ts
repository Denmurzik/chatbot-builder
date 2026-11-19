// Точка входа пакета @chatbot/engine-core
export { MapScope, type VariableScope } from './scope';
export { extractVariableNames, render, substitute, type RenderMode } from './template';
export { ExpressionError, evaluate, parseExpression, toBoolean } from './expression';
export { ExpressionEvaluator } from './expression-evaluator';
export { extract, parseJsonPath, toText } from './json-path';
export { DialogEngine, MSG_LOOP, MSG_WAIT, type DialogRun } from './dialog-engine';
export { DialogContext } from './dialog-context';
export type {
  DialogContextState,
  EngineResult,
  OutgoingButton,
  OutgoingMessage,
  PendingHttpHeader,
  PendingHttpRequest,
} from './outbox';
