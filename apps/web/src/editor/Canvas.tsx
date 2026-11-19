import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BLOCK_META } from './block-meta';
import { BLOCK_NODE_TYPE, edgeId, type BlockNode as BlockNodeType } from './convert';
import { BlockNode } from './nodes/BlockNode';

// Типы узлов вне компонента — иначе React Flow пересоздаёт их на каждом рендере
const nodeTypes = { [BLOCK_NODE_TYPE]: BlockNode };

interface CanvasProps {
  nodes: BlockNodeType[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<BlockNodeType>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onEdgesReplace: (updater: (edges: Edge[]) => Edge[]) => void;
}

export function Canvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onEdgesReplace,
}: CanvasProps) {
  // Из одного выхода — один переход: новое соединение заменяет прежнее
  function handleConnect(connection: Connection) {
    if (!connection.sourceHandle) return;
    const output = connection.sourceHandle;
    onEdgesReplace((current) => [
      ...current.filter((e) => !(e.source === connection.source && e.sourceHandle === output)),
      {
        id: edgeId(connection.source, output),
        source: connection.source,
        sourceHandle: output,
        target: connection.target,
      },
    ]);
  }

  return (
    <div className="size-full" data-testid="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        deleteKeyCode="Delete"
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => BLOCK_META[(node as BlockNodeType).data.type].color}
        />
      </ReactFlow>
    </div>
  );
}
