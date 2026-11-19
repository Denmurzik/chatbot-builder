import { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { BlockType } from '@chatbot/model';
import { cn } from '@/lib/utils';
import { ru } from '@/i18n/ru';
import { BLOCK_META } from '../block-meta';
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

export function BlockNode({ id, data, selected }: NodeProps<BlockNodeType>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const meta = BLOCK_META[data.type];
  const Icon = meta.icon;
  const outputs = safeOutputs(data);
  const outputsKey = JSON.stringify(outputs);

  // После смены набора ручек React Flow нужно пересчитать их положение
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, outputsKey, updateNodeInternals]);

  return (
    <div
      className={cn(
        'min-w-48 max-w-64 rounded-lg border bg-card text-card-foreground shadow-sm',
        selected && 'ring-2 ring-ring',
      )}
      style={{ borderTopColor: meta.color, borderTopWidth: 3 }}
    >
      {data.type !== 'ENTRY_POINT' && (
        <Handle type="target" position={Position.Top} className="!size-3 !bg-muted-foreground" />
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: meta.color }}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{data.title || meta.label}</div>
          <div className="truncate text-xs text-muted-foreground">{meta.label}</div>
        </div>
      </div>
      {outputs.length > 0 && (
        <div className="flex flex-col border-t py-1">
          {outputs.map((output) => (
            <div
              key={output}
              className="relative px-3 py-0.5 text-right text-xs text-muted-foreground"
            >
              {outputLabel(data.type, output)}
              <Handle
                id={output}
                type="source"
                position={Position.Right}
                className="!size-3"
                style={{ backgroundColor: meta.color }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
