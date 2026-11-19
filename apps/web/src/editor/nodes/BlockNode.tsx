import { useEffect, useState, type ReactNode } from 'react';
import {
  Handle,
  NodeToolbar,
  Position,
  useNodeConnections,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import { Copy, MoreHorizontal, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import type { BlockType } from '@chatbot/model';
import { cn } from '@/lib/utils';
import { ru } from '@/i18n/ru';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconAction } from '../IconAction';
import { useEditorActions } from '../actions';
import { BLOCK_META } from '../block-meta';
import { blockPreview } from '../preview';
import { useHoverDelay } from '../useHoverDelay';
import { safeOutputs, type BlockNode as BlockNodeType } from '../convert';

// Служебные выходы, имена которых переводим, — только для своих типов блоков
const SERVICE_OUTPUTS: Partial<Record<BlockType, readonly string[]>> = {
  ENTRY_POINT: ['default'],
  TEXT_MESSAGE: ['default'],
  TEXT_INPUT: ['default'],
  ASSIGNMENT: ['default'],
  LIST_CHOICE: ['default', 'noOptions'],
  CONDITION: ['yes', 'no'],
  SWITCH: ['else'],
  HTTP_REQUEST: ['success', 'error'],
};

// Подпись выхода: служебные переводим, варианты и значения показываем как есть
function outputLabel(type: BlockType, output: string): string {
  const isService = SERVICE_OUTPUTS[type]?.includes(output) ?? false;
  return isService && Object.hasOwn(ru.outputs, output)
    ? ru.outputs[output as keyof typeof ru.outputs]
    : output;
}

type Shape = 'start' | 'finish' | 'talk' | 'branch' | 'compact' | 'integration';

// Форма блока по категории: развилки — «ромбовидная» плашка, присваивание — компактная карточка
function shapeOf(type: BlockType): Shape {
  const { category } = BLOCK_META[type];
  if (category === 'logic') return type === 'ASSIGNMENT' ? 'compact' : 'branch';
  return category;
}

// Один выход: подпись, ручка справа и «+» у неподключённого выхода
function OutputRow({
  nodeId,
  type,
  output,
  color,
}: {
  nodeId: string;
  type: BlockType;
  output: string;
  color: string;
}) {
  const { addFromOutput } = useEditorActions();
  const connections = useNodeConnections({ id: nodeId, handleType: 'source', handleId: output });
  return (
    <div className="relative px-3 py-0.5 text-right text-xs text-muted-foreground">
      {outputLabel(type, output)}
      <Handle
        id={output}
        type="source"
        position={Position.Right}
        className="!size-3"
        style={{ backgroundColor: color }}
      />
      {connections.length === 0 && (
        <div className="pointer-events-none absolute top-1/2 left-full flex -translate-y-1/2 items-center pl-1.5">
          <span className="h-px w-5 bg-border" />
          <button
            type="button"
            aria-label={ru.editor.addNextBlock}
            title={ru.editor.addNextBlock}
            className="nodrag nopan pointer-events-auto flex size-5 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => addFromOutput(nodeId, output)}
          >
            <Plus className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// Меню над блоком: «Настроить», «Дублировать», «Удалить», «Ещё» (переименовать)
function NodeMenu({
  id,
  isEntry,
  visible,
  onMenuOpenChange,
  hoverHandlers,
}: {
  id: string;
  isEntry: boolean;
  visible: boolean;
  onMenuOpenChange: (open: boolean) => void;
  hoverHandlers: { onMouseEnter: () => void; onMouseLeave: () => void };
}) {
  const { openBlock, duplicate, remove, rename } = useEditorActions();
  const t = ru.editor.nodeActions;
  return (
    <NodeToolbar isVisible={visible} position={Position.Top} offset={8}>
      <div className="nodrag nopan flex gap-1" {...hoverHandlers}>
        <IconAction icon={Settings2} label={t.configure} onClick={() => openBlock(id)} />
        {!isEntry && <IconAction icon={Copy} label={t.duplicate} onClick={() => duplicate(id)} />}
        {!isEntry && (
          <IconAction
            icon={Trash2}
            label={t.remove}
            onClick={() => remove(id)}
            className="hover:text-destructive"
          />
        )}
        <DropdownMenu onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <IconAction icon={MoreHorizontal} label={t.more} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => rename(id)}>
              <Pencil className="size-4" />
              {t.rename}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </NodeToolbar>
  );
}

const SHAPE_CLASSES: Record<Shape, string> = {
  // Точка входа: скруглена слева, как «начало» потока
  start: 'min-w-44 max-w-56 rounded-l-full rounded-r-lg border bg-card pl-2',
  // Точка выхода: скруглена справа, как «конец» потока
  finish: 'min-w-44 max-w-56 rounded-r-full rounded-l-lg border bg-card pr-2',
  // Реплика: крупное скругление и хвостик снизу слева
  talk: 'min-w-48 max-w-64 rounded-2xl rounded-bl-md border bg-card',
  // Развилка: прямоугольное тело, ромб — значок
  branch: 'min-w-48 max-w-64 rounded-lg border bg-card',
  // Присваивание: компактная карточка
  compact: 'min-w-40 max-w-56 rounded-md border bg-card',
  // Интеграция: двойная рамка (внутренняя рисуется отдельно)
  integration: 'min-w-48 max-w-64 rounded-lg border-2 bg-card p-0.5',
};

// Значок блока: у развилок — ромб, у остальных — скруглённый квадрат (у начала и конца — круг)
function BlockIcon({
  shape,
  color,
  children,
}: {
  shape: Shape;
  color: string;
  children: ReactNode;
}) {
  if (shape === 'branch') {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center">
        <span
          className="flex size-6 rotate-45 items-center justify-center rounded-[4px] text-white"
          style={{ backgroundColor: color }}
        >
          <span className="-rotate-45">{children}</span>
        </span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center text-white',
        shape === 'compact' ? 'size-5 rounded' : 'size-6 rounded-md',
        (shape === 'start' || shape === 'finish') && 'rounded-full',
      )}
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}

export function BlockNode({ id, data, selected }: NodeProps<BlockNodeType>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const { hovered, handlers } = useHoverDelay(150);
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = BLOCK_META[data.type];
  const Icon = meta.icon;
  const shape = shapeOf(data.type);
  const outputs = safeOutputs(data);
  const preview = blockPreview(data);
  const outputsKey = JSON.stringify(outputs);

  // После смены набора ручек React Flow нужно пересчитать их положение
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, outputsKey, updateNodeInternals]);

  const content = (
    <>
      <div className={cn('flex items-center gap-2 px-3', shape === 'compact' ? 'py-1.5' : 'py-2')}>
        <BlockIcon shape={shape} color={meta.color}>
          <Icon className={shape === 'compact' ? 'size-3' : 'size-4'} />
        </BlockIcon>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{data.title || meta.label}</div>
          <div className="truncate text-xs text-muted-foreground">{meta.label}</div>
        </div>
      </div>
      {preview && (
        <div
          className={cn(
            'line-clamp-2 px-3 pb-2 text-xs break-words text-muted-foreground',
            shape === 'compact' && 'font-mono',
          )}
        >
          {preview}
        </div>
      )}
      {outputs.length > 0 && (
        <div className="flex flex-col border-t py-1">
          {outputs.map((output) => (
            <OutputRow
              key={output}
              nodeId={id}
              type={data.type}
              output={output}
              color={meta.color}
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div
      data-block-shape={shape}
      className={cn(
        'relative text-card-foreground shadow-sm',
        SHAPE_CLASSES[shape],
        selected && 'ring-2 ring-ring',
      )}
      style={{ borderTopColor: meta.color, borderTopWidth: shape === 'integration' ? 2 : 3 }}
      {...handlers}
    >
      <NodeMenu
        id={id}
        isEntry={data.type === 'ENTRY_POINT'}
        visible={Boolean(selected) || hovered || menuOpen}
        onMenuOpenChange={setMenuOpen}
        hoverHandlers={handlers}
      />
      {data.type !== 'ENTRY_POINT' && (
        <Handle type="target" position={Position.Left} className="!size-3 !bg-muted-foreground" />
      )}
      {shape === 'integration' ? <div className="rounded-md border">{content}</div> : content}
      {shape === 'talk' && (
        // Хвостик «реплики»
        <span
          aria-hidden
          className="absolute -bottom-1.5 left-4 size-3 rotate-45 border-r border-b bg-card"
        />
      )}
    </div>
  );
}
