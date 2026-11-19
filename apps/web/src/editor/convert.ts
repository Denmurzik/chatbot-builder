import type { Edge, Node } from '@xyflow/react';
import { getOutputs, type Block, type Scenario } from '@chatbot/model';

// Omit, сохраняющий размеченное объединение
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// Данные узла — ТОЛЬКО поля блока модели (без id/x/y): состояние интерфейса сюда не попадает,
// иначе оно утекло бы в сохранённый сценарий
export type BlockNodeData = DistributiveOmit<Block, 'id' | 'x' | 'y'>;
export type BlockNode = Node<BlockNodeData, 'block'>;

export const BLOCK_NODE_TYPE = 'block' as const;

export function edgeId(source: string, output: string): string {
  return `${source}::${output}`;
}

// Собирает блок модели из узла холста
export function nodeToBlock(node: BlockNode): Block {
  return {
    ...node.data,
    id: node.id,
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
  } as Block;
}

export function scenarioToFlow(scenario: Scenario): { nodes: BlockNode[]; edges: Edge[] } {
  const nodes: BlockNode[] = scenario.blocks.map((block) => {
    const { id, x, y, ...data } = block;
    return { id, type: BLOCK_NODE_TYPE, position: { x, y }, data };
  });
  const edges: Edge[] = scenario.transitions.map((transition) => ({
    id: edgeId(transition.source.blockId, transition.source.output),
    source: transition.source.blockId,
    sourceHandle: transition.source.output,
    target: transition.target,
  }));
  return { nodes, edges };
}

// Оставляет только рёбра с существующими узлами и выходами (ручка = имя выхода)
export function pruneEdges(nodes: BlockNode[], edges: Edge[]): Edge[] {
  const outputsById = new Map(nodes.map((node) => [node.id, getOutputs(nodeToBlock(node))]));
  return edges.filter(
    (edge) =>
      edge.sourceHandle != null &&
      (outputsById.get(edge.source)?.includes(edge.sourceHandle) ?? false) &&
      outputsById.has(edge.target),
  );
}

export function flowToScenario(nodes: BlockNode[], edges: Edge[]): Scenario {
  return {
    formatVersion: 1,
    blocks: nodes.map(nodeToBlock),
    transitions: pruneEdges(nodes, edges).map((edge) => ({
      source: { blockId: edge.source, output: edge.sourceHandle as string },
      target: edge.target,
    })),
  };
}
