import { describe, expect, it } from 'vitest';
import { backwardEdgePath, isBackward } from './backward-path';

const sourceRect = { x: 400, y: 0, width: 280, height: 100 };
const targetRect = { x: 100, y: 20, width: 280, height: 160 };

describe('backwardEdgePath', () => {
  it('нижний отрезок ниже обоих блоков на 40, подпись — в его середине', () => {
    const { path, labelX, labelY } = backwardEdgePath(
      { x: 680, y: 50 },
      { x: 100, y: 100 },
      sourceRect,
      targetRect,
    );
    // низ цели (180) ниже низа источника (100): 180 + 40
    expect(labelY).toBe(220);
    expect(labelX).toBe((704 + 76) / 2);
    expect(path.startsWith('M 680 50')).toBe(true);
    expect(path.endsWith('L 100 100')).toBe(true);
    // Путь доходит до нижнего уровня и содержит дуги скругления
    expect(path).toContain('220');
    expect(path).toContain('Q');
  });

  it('учитывает более низкий источник', () => {
    const { labelY } = backwardEdgePath(
      { x: 680, y: 50 },
      { x: 100, y: 100 },
      { x: 400, y: 0, width: 280, height: 300 },
      targetRect,
    );
    expect(labelY).toBe(340);
  });
});

describe('isBackward', () => {
  it('прямая связь — вход правее выхода минимум на 40', () => {
    expect(isBackward({ x: 100, y: 0 }, { x: 140, y: 0 })).toBe(false);
    expect(isBackward({ x: 100, y: 0 }, { x: 139, y: 0 })).toBe(true);
    expect(isBackward({ x: 100, y: 0 }, { x: 50, y: 0 })).toBe(true);
  });
});
