import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { Plus, Trash2 } from 'lucide-react';
import { ru } from '@/i18n/ru';
import { IconAction } from '../IconAction';
import { useEditorActions } from '../actions';
import { useHoverDelay } from '../useHoverDelay';

const ARROW_COLOR = 'var(--muted-foreground)';
const ARROW_COLOR_SELECTED = 'var(--primary)';

interface EdgeButtonsProps {
  visible: boolean;
  onInsert: () => void;
  onDelete: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

// Кнопки «добавить блок» и «удалить связь» в середине связи
export function EdgeButtons({
  visible,
  onInsert,
  onDelete,
  onMouseEnter,
  onMouseLeave,
}: EdgeButtonsProps) {
  if (!visible) return null;
  return (
    <div
      className="nodrag nopan pointer-events-auto flex gap-1"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <IconAction icon={Plus} label={ru.editor.insertOnEdge} onClick={onInsert} />
      <IconAction
        icon={Trash2}
        label={ru.editor.deleteEdge}
        onClick={onDelete}
        className="hover:text-destructive"
      />
    </div>
  );
}

export function ScenarioEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const { insertOnEdge } = useEditorActions();
  const { hovered, handlers } = useHoverDelay(150);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Стрелка рисуется здесь же: обычная и акцентная (у выделенной связи) — разные маркеры
  const markerId = `arrow-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}${selected ? '-selected' : ''}`;
  const color = selected ? ARROW_COLOR_SELECTED : ARROW_COLOR;

  return (
    <g {...handlers}>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} style={{ fill: color }} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        interactionWidth={24}
        style={{ stroke: color, strokeWidth: selected ? 2.5 : 1.5 }}
      />
      <EdgeLabelRenderer>
        <div
          className="absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          <EdgeButtons
            visible={hovered || Boolean(selected)}
            onInsert={() => insertOnEdge(id)}
            onDelete={() => void deleteElements({ edges: [{ id }] })}
            onMouseEnter={handlers.onMouseEnter}
            onMouseLeave={handlers.onMouseLeave}
          />
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}
