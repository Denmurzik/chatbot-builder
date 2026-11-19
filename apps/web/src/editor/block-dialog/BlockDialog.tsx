import type { Edge } from '@xyflow/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { availableVariables } from '@chatbot/model';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ru } from '@/i18n/ru';
import { BLOCK_META } from '../block-meta';
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

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-h-0 flex-col border-r last:border-r-0">
      <h2 className="border-b px-4 py-2 text-sm font-semibold">{title}</h2>
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
  const meta = BLOCK_META[node.data.type];
  const Icon = meta.icon;

  return (
    <InsertContext.Provider value={registry}>
      <header className="flex items-center gap-3 border-b py-3 pr-12 pl-4">
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
        <Column title={t.input}>
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
          <SettingsPane
            data={node.data}
            variables={variables.map((variable) => variable.name)}
            onChange={(data) => onChange(node.id, data)}
          />
        </Column>
        <Column title={t.output}>
          <OutputPane node={node} nodes={nodes} edges={edges} testValues={testValues} />
        </Column>
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

  // Блок удалили, пока окно открыто, — закрываем
  useEffect(() => {
    if (nodeId !== null && !node) onClose();
  }, [nodeId, node, onClose]);

  return (
    <Dialog open={node !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={t.label}
        className="flex h-[90vh] max-w-[90vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[90vw]"
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
        // Esc при открытом списке подсказок закрывает только список
        onEscapeKeyDown={(event) => {
          if (isCompletionOpen()) event.preventDefault();
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
