import { describe, expect, it } from 'vitest';
import { LASSO_MAX_POINTS, lassoHints, lassoMask, simplifyLasso } from '../../src/engine/common/parts/lasso';

const inside = (m: Uint8Array, w: number, x: number, y: number) => m[y * w + x] > 0;

describe('a rough lasso (005 FR-504, FR-505)', () => {
  it('the inside of the drawn shape is the aim', () => {
    const m = lassoMask([[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]], 100, 80);
    let n = 0;
    for (const v of m) if (v) n++;
    expect(n / (100 * 80)).toBeCloseTo(0.25, 2);
    expect(inside(m, 100, 50, 40)).toBe(true);
    expect(inside(m, 100, 10, 10)).toBe(false);
    // A concave shape (a C): its mouth stays outside.
    const c = lassoMask([[0.2, 0.2], [0.8, 0.2], [0.8, 0.35], [0.4, 0.35], [0.4, 0.65], [0.8, 0.65], [0.8, 0.8], [0.2, 0.8]], 100, 100);
    expect(inside(c, 100, 30, 50)).toBe(true);
    expect(inside(c, 100, 60, 50)).toBe(false);
  });

  it('hints for the AI lie inside the shape', () => {
    const shape: [number, number][] = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.35], [0.4, 0.35], [0.4, 0.65], [0.8, 0.65], [0.8, 0.8], [0.2, 0.8]];
    const m = lassoMask(shape, 200, 200);
    const hints = lassoHints(shape);
    expect(hints.length).toBeGreaterThan(0);
    for (const [u, v] of hints) expect(inside(m, 200, Math.floor(u * 200), Math.floor(v * 200))).toBe(true);
  });

  it('a long drag is thinned to at most 256 points, kept in [0, 1]', () => {
    const many: [number, number][] = Array.from({ length: 2000 }, (_, k) => [0.5 + 0.6 * Math.cos(k / 318), 0.5 + 0.3 * Math.sin(k / 318)]);
    const s = simplifyLasso(many);
    expect(s.length).toBeLessThanOrEqual(LASSO_MAX_POINTS);
    expect(s.length).toBeGreaterThanOrEqual(3);
    for (const [u, v] of s) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
