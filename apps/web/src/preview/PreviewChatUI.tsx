import { NotImplementedError, type Block } from '@chatbot/model';
import { ru } from '../i18n/ru';

export interface PreviewChatActions {
  sendInput(text: string): void;
  showMessage(text: string, buttons?: string[]): void;
  highlightBlock(block: Block): void;
  showVariables(variables: Record<string, string>): void;
  showSystemMessage(text: string): void;
  pressRestart(): void;
}

/**
 * Хук операций класса модели BCE PreviewChatUI (UC-A-20…A-23, спринт 3).
 */
export function usePreviewChat(): PreviewChatActions {
  return {
    sendInput(_text: string): void {
      throw new NotImplementedError('PreviewChatUI.sendInput');
    },
    showMessage(_text: string, _buttons?: string[]): void {
      throw new NotImplementedError('PreviewChatUI.showMessage');
    },
    highlightBlock(_block: Block): void {
      throw new NotImplementedError('PreviewChatUI.highlightBlock');
    },
    showVariables(_variables: Record<string, string>): void {
      throw new NotImplementedError('PreviewChatUI.showVariables');
    },
    showSystemMessage(_text: string): void {
      throw new NotImplementedError('PreviewChatUI.showSystemMessage');
    },
    pressRestart(): void {
      throw new NotImplementedError('PreviewChatUI.pressRestart');
    },
  };
}

/**
 * Класс модели BCE: PreviewChatUI — окно чата превью с подсветкой текущего блока и панелью переменных.
 * Реализует UC-A-20…A-23; реализация и подключение маршрута запланированы на спринт 3.
 */
export function PreviewChatUI() {
  return (
    <section aria-label={ru.preview.title} className="p-4 text-sm text-muted-foreground">
      {ru.preview.placeholder}
    </section>
  );
}
