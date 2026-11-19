import { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { getOutputs } from '@chatbot/model';
import { cn } from '@/lib/utils';
import { ru } from '@/i18n/ru';
import { BLOCK_META } from '../block-meta';
import { nodeToBlock, type BlockNode as BlockNodeType } from '../convert';

// Подпись выхода: известные имена переводим, остальные (варианты, значения) показываем как есть
function outputLabel(output: string): string {
  return (ru.outputs as Record<string, string>)[output] ?? output;
}

export function BlockNode({ id, data, selected }: NodeProps<BlockNodeType>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const meta = BLOCK_META[data.type];
  const Icon = meta.icon;
  const outputs = getOutputs(nodeToBlock({ id, data, position: { x: 0, y: 0 } } as BlockNodeType));
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
              {outputLabel(output)}
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
