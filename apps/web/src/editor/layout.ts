import type { Edge } from '@xyflow/react';
import { Graph, layout } from '@dagrejs/dagre';
import type { BlockNode } from './convert';
import { defaultNodeSize, snapToGrid } from './placement';

const NODE_SEP = 60;
const RANK_SEP = 120;

function sizeOf(node: BlockNode): { width: number; height: number } {
  const fallback = defaultNodeSize(node.data.type);
  return {
    width: node.measured?.width ?? fallback.width,
    height: node.measured?.height ?? fallback.height,
  };
}

// Раскладка слева направо (dagre): возвращает узлы с новыми позициями по сетке 20
export function layoutScenario(nodes: BlockNode[], edges: Edge[]): BlockNode[] {
  if (nodes.length === 0) return [];
  const graph = new Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_SEP, ranksep: RANK_SEP });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, sizeOf(node));
  const ids = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (ids.has(edge.source) && ids.has(edge.target)) graph.setEdge(edge.source, edge.target);
  }
  layout(graph);

  return nodes.map((node) => {
    const placed = graph.node(node.id);
    const { width, height } = sizeOf(node);
    // dagre отдаёт центр узла — переводим в левый верхний угол и привязываем к сетке
    return {
      ...node,
      position: {
        x: snapToGrid(placed.x - width / 2),
        y: snapToGrid(placed.y - height / 2),
      },
    };
  });
}
