// Размеры узла по умолчанию (min-w-48 … max-w-64), пока React Flow не измерил его
export const NODE_WIDTH = 256;
export const NODE_HEIGHT = 140;
export const NODE_GAP = 40;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlacedNode {
  position: { x: number; y: number };
  selected?: boolean;
  measured?: { width?: number; height?: number };
}

function boxOf(node: PlacedNode): Box {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? NODE_WIDTH,
    height: node.measured?.height ?? NODE_HEIGHT,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width + NODE_GAP / 2 &&
    b.x < a.x + a.width + NODE_GAP / 2 &&
    a.y < b.y + b.height + NODE_GAP / 2 &&
    b.y < a.y + a.height + NODE_GAP / 2
  );
}

// Свободное место для нового блока: ниже выбранного (или последнего) блока,
// при занятости — сдвиг вниз, затем вправо; без блоков — в центре видимой области
export function findFreePosition(
  nodes: readonly PlacedNode[],
  center: { x: number; y: number },
): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: Math.round(center.x - NODE_WIDTH / 2), y: Math.round(center.y - NODE_HEIGHT / 2) };
  }
  const anchor = nodes.find((n) => n.selected) ?? nodes[nodes.length - 1]!;
  const a = boxOf(anchor);
  const boxes = nodes.map(boxOf);
  const candidate: Box = {
    x: a.x,
    y: a.y + a.height + NODE_GAP,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };
  for (let column = 0; column < 50; column += 1) {
    for (let row = 0; row < 200; row += 1) {
      if (!boxes.some((b) => overlaps(candidate, b))) {
        return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
      }
      const hit = boxes.find((b) => overlaps(candidate, b))!;
      candidate.y = hit.y + hit.height + NODE_GAP;
    }
    candidate.x += NODE_WIDTH + NODE_GAP;
    candidate.y = a.y;
  }
  return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
}
