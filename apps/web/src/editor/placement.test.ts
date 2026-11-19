import { describe, expect, it } from 'vitest';
import { NODE_HEIGHT, NODE_WIDTH, findFreePosition } from './placement';

type N = { position: { x: number; y: number }; selected?: boolean };

function intersects(a: N, b: { x: number; y: number }): boolean {
  return (
    a.position.x < b.x + NODE_WIDTH &&
    b.x < a.position.x + NODE_WIDTH &&
    a.position.y < b.y + NODE_HEIGHT &&
    b.y < a.position.y + NODE_HEIGHT
  );
}

describe('findFreePosition', () => {
  it('без блоков центрирует новый блок', () => {
    const p = findFreePosition([], { x: 500, y: 300 });
    expect(p).toEqual({ x: 500 - NODE_WIDTH / 2, y: 300 - NODE_HEIGHT / 2 });
  });

  it('ставит блок ниже выбранного без пересечения', () => {
    const nodes: N[] = [{ position: { x: 0, y: 0 }, selected: true }];
    const p = findFreePosition(nodes, { x: 0, y: 0 });
    expect(p.y).toBeGreaterThanOrEqual(NODE_HEIGHT);
    expect(intersects(nodes[0]!, p)).toBe(false);
  });

  it('при подряд добавленных блоках не накладывает их друг на друга', () => {
    const nodes: N[] = [{ position: { x: 0, y: 0 } }];
    for (let i = 0; i < 12; i += 1) {
      const p = findFreePosition(nodes, { x: 0, y: 0 });
      expect(nodes.some((n) => intersects(n, p))).toBe(false);
      nodes.push({ position: p });
    }
  });

  it('обходит занятое место под якорем', () => {
    const nodes: N[] = [
      { position: { x: 0, y: 200 } },
      { position: { x: 0, y: 0 }, selected: true },
    ];
    const p = findFreePosition(nodes, { x: 0, y: 0 });
    expect(nodes.some((n) => intersects(n, p))).toBe(false);
  });
});
