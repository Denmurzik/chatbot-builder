import { closeCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import type { Edge } from '@xyflow/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { availableVariables } from '@chatbot/model';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ru } from '@/i18n/ru';
import { cn } from '@/lib/utils';
import { BLOCK_META } from '../block-meta';
import { FieldContext } from '../fields/field-context';
import { flowToScenario, type BlockNode, type BlockNodeData } from '../convert';
import { InputPane } from './InputPane';
import { InsertContext, type InsertTarget } from './insert-target';
import { OutputPane } from './OutputPane';
import { SettingsPane } from './SettingsPane';

const t = ru.blockDialog;

interface BlockDialogProps {
  // Блок, чьё окно открыто; null — окно закрыто
  nodeId: string | null;
  nodes: BlockNode[];
  edges: Edge[];
  onChange: (id: string, data: BlockNodeData) => void;
  onClose: () => void;
  // Открыть сразу с выделенным названием (действие «Переименовать»)
  focusTitle?: boolean;
}

// Список подсказок CodeMirror открыт: Esc должен закрыть только его
function isCompletionOpen(): boolean {
  return document.querySelector('.cm-tooltip-autocomplete') !== null;
}

// Поле ввода (в том числе редактор CodeMirror): кнопки и ссылки цель вставки не сбрасывают
function isTextField(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') ||
      target.closest('[contenteditable="true"]') !== null)
  );
}

// Боковые колонки («Вход», «Выход») тоном отличаются от центральной («Настройки»), как слои в n8n
function Column({
  title,
  side = false,
  children,
}: {
  title: string;
  side?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-h-0 flex-col border-r border-border last:border-r-0',
        side && 'bg-muted/40',
      )}
    >
      <h2 className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  );
}

function DialogBody({
  node,
  nodes,
  edges,
  onChange,
}: {
  node: BlockNode;
  nodes: BlockNode[];
  edges: Edge[];
  onChange: BlockDialogProps['onChange'];
}) {
  // Тестовые значения живут только пока окно открыто
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<InsertTarget | null>(null);
  const registry = useMemo(() => ({ target, setTarget }), [target]);

  const variables = useMemo(
    () => availableVariables(flowToScenario(nodes, edges), node.id),
    [nodes, edges, node.id],
  );
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.data.title])), [nodes]);
  // Тестовые значения и блоки-источники для «Результата» и документации подсказок в полях
  const fieldContext = useMemo(
    () => ({
      testValues,
      sources: Object.fromEntries(
        variables.map((variable) => [variable.name, titles.get(variable.sourceBlockId) ?? '']),
      ),
    }),
    [testValues, variables, titles],
  );
  const meta = BLOCK_META[node.data.type];
  const Icon = meta.icon;

  return (
    <InsertContext.Provider value={registry}>
      {/* Фокус в любом другом поле сбрасывает цель «Вставить»; поля-цели ставят её после (CodeMirror — на focusin) */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        onFocusCapture={(event) => {
          if (isTextField(event.target)) setTarget(null);
        }}
      >
        <header className="flex items-center gap-3 border-b border-border bg-muted/40 py-3 pr-12 pl-4">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: meta.color }}
          >
            <Icon className="size-5" />
          </span>
          <Input
            data-title-input
            className="max-w-md text-base font-semibold"
            aria-label={t.titleLabel}
            value={node.data.title}
            onChange={(event) => onChange(node.id, { ...node.data, title: event.target.value })}
          />
          <span className="text-sm text-muted-foreground">
            {meta.label} · {ru.fields.id}: {node.id}
          </span>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
          <Column title={t.input} side>
            <InputPane
              variables={variables}
              titles={titles}
              testValues={testValues}
              onTestValueChange={(name, value) =>
                setTestValues((prev) => ({ ...prev, [name]: value }))
              }
            />
          </Column>
          <Column title={t.settings}>
            <FieldContext.Provider value={fieldContext}>
              <SettingsPane
                data={node.data}
                variables={variables.map((variable) => variable.name)}
                onChange={(data) => onChange(node.id, data)}
              />
            </FieldContext.Provider>
          </Column>
          <Column title={t.output} side>
            <OutputPane node={node} nodes={nodes} edges={edges} testValues={testValues} />
          </Column>
        </div>
      </div>
    </InsertContext.Provider>
  );
}

// Большое окно блока в стиле n8n: «Вход — Настройки — Выход». Изменения применяются сразу
export function BlockDialog({
  nodeId,
  nodes,
  edges,
  onChange,
  onClose,
  focusTitle = false,
}: BlockDialogProps) {
  const node = nodeId === null ? undefined : nodes.find((n) => n.id === nodeId);

  // Esc при открытом списке подсказок закрывает только список. Radix слушает Esc на document и
  // помечает событие обработанным (preventDefault), после чего CodeMirror его игнорирует, поэтому
  // перехватываем раньше Radix (слушатель добавлен при монтировании, до открытия окна) и сами
  // закрываем список
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !isCompletionOpen()) return;
      event.stopImmediatePropagation();
      const editor = document.activeElement?.closest<HTMLElement>('.cm-editor');
      const view = editor ? EditorView.findFromDOM(editor) : null;
      if (view) closeCompletion(view);
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Блок удалили, пока окно открыто, — закрываем
  useEffect(() => {
    if (nodeId !== null && !node) onClose();
  }, [nodeId, node, onClose]);

  return (
    <Dialog open={node !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={t.label}
        className="flex h-[90vh] max-w-[90vw] flex-col gap-0 overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-[90vw]"
        // Не уводим фокус на первое поле само по себе — фокус на окне (иначе он остался бы на холсте
        // и Tab открыл бы панель блоков); для «Переименовать» — в название
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (!(event.target instanceof HTMLElement)) return;
          const title = event.target.querySelector<HTMLInputElement>('[data-title-input]');
          if (focusTitle && title) {
            title.focus();
            title.select();
          } else {
            event.target.focus();
          }
        }}
      >
        <DialogTitle className="sr-only">{node?.data.title ?? t.label}</DialogTitle>
        <DialogDescription className="sr-only">{t.label}</DialogDescription>
        {node && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* key: при смене блока локальное состояние окна (тестовые значения, поля) сбрасывается */}
            <DialogBody key={node.id} node={node} nodes={nodes} edges={edges} onChange={onChange} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
