import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { LayoutGrid } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { useColorMode } from '@/app/theme';
import { Button } from '@/components/ui/button';
import { ru } from '@/i18n/ru';
import { BLOCK_META } from './block-meta';
import { BLOCK_NODE_TYPE, connectEdges, type BlockNode as BlockNodeType } from './convert';
import { filterDeletion } from './deletion';
import { ScenarioEdge } from './edges/ScenarioEdge';
import { GRID_SIZE } from './placement';
import { BlockNode } from './nodes/BlockNode';

// Типы узлов вне компонента — иначе React Flow пересоздаёт их на каждом рендере
const nodeTypes = { [BLOCK_NODE_TYPE]: BlockNode };
// Стрелки и кнопки на связи рисует сам ScenarioEdge — тип и markerEnd у рёбер задавать не нужно
const edgeTypes = { default: ScenarioEdge };
const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];

// Delete в инспекторе, выпадающих списках и диалогах не должен удалять блоки на холсте
function isFocusInsidePanel(): boolean {
  const active = document.activeElement;
  return (
    active instanceof Element &&
    active.closest('[data-inspector], [data-radix-popper-content-wrapper], [role="dialog"]') !==
      null
  );
}

interface CanvasProps {
  nodes: BlockNodeType[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<BlockNodeType>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onEdgesReplace: (updater: (edges: Edge[]) => Edge[]) => void;
  onAutoLayout: () => void;
}

export function Canvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onEdgesReplace,
  onAutoLayout,
}: CanvasProps) {
  const colorMode = useColorMode();

  // Из одного выхода — один переход: новое соединение заменяет прежнее
  function handleConnect(connection: Connection) {
    const { source, sourceHandle, target } = connection;
    if (!sourceHandle) return;
    onEdgesReplace((current) => connectEdges(current, { source, sourceHandle, target }));
  }

  return (
    <div className="size-full" data-testid="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        snapToGrid
        snapGrid={SNAP_GRID}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        deleteKeyCode={['Delete', 'Backspace']}
        onBeforeDelete={async ({ nodes: doomed, edges: doomedEdges }) =>
          isFocusInsidePanel() ? false : filterDeletion(doomed, doomedEdges)
        }
        colorMode={colorMode}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={GRID_SIZE} />
        <Panel position="top-right" aria-label={ru.editor.canvasActions}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAutoLayout}
            title={ru.editor.autoLayoutHint}
          >
            <LayoutGrid className="size-4" />
            {ru.editor.autoLayout}
          </Button>
        </Panel>
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          bgColor="color-mix(in oklab, var(--card) 60%, transparent)"
          maskColor="color-mix(in oklab, var(--muted-foreground) 15%, transparent)"
          className="!border !border-border rounded-md overflow-hidden backdrop-blur-sm opacity-75 transition-[opacity,background-color] hover:opacity-100 hover:!bg-card"
          nodeColor={(node) => BLOCK_META[(node as BlockNodeType).data.type].color}
        />
      </ReactFlow>
    </div>
  );
}
