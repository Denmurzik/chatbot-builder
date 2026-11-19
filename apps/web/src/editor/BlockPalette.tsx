import type { BlockType } from '@chatbot/model';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ru } from '@/i18n/ru';
import { BLOCK_META, BLOCK_ORDER } from './block-meta';

interface BlockPaletteProps {
  onAdd: (type: BlockType) => void;
}

// Левая колонка: клик по типу добавляет блок в центр видимой области холста
export function BlockPalette({ onAdd }: BlockPaletteProps) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-card" aria-label={ru.editor.palette}>
      <h2 className="px-4 py-3 text-sm font-semibold">{ru.editor.palette}</h2>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pb-3">
          {BLOCK_ORDER.map((type) => {
            const meta = BLOCK_META[type];
            const Icon = meta.icon;
            return (
              <Tooltip key={type}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onAdd(type)}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon className="size-4" />
                    </span>
                    {meta.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{ru.editor.paletteHint}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
