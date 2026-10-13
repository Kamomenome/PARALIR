import { describe, expect, it } from 'vitest';
import { fragmentLayout, splitPieces } from '../../src/engine/space-v2/worlds/split/split';
import { spaceWorld } from '../helpers/space';
import { figurePhoto } from '../helpers/space2';

const area = (poly: [number, number][]) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    s += x0 * y1 - x1 * y0;
  }
  return Math.abs(s) / 2;
};

describe('world ④ the subject split, rebuilt and overlapped (003 FR-305, SC-308, SC-305)', () => {
  it('straight cuts into convex pieces that tile the box; rebuilt apart; copies stepped by a pattern or partly at random', async () => {
    const modes = new Set<string>();
    for (let variation = 0; variation < 30; variation++) {
      const { world } = await spaceWorld(figurePhoto(), { variation });
      const p = world.split;
      const pieces = splitPieces(p);
      expect(pieces.length).toBeGreaterThanOrEqual(4);
      expect(pieces.reduce((s, q) => s + area(q), 0)).toBeCloseTo(1, 9);
      for (const q of pieces) {
        let sign = 0;
        for (let i = 0; i < q.length; i++) {
          const [ax, ay] = q[i];
          const [bx, by] = q[(i + 1) % q.length];
          const [cx, cy] = q[(i + 2) % q.length];
          const cr = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
          if (Math.abs(cr) < 1e-12) continue;
          if (sign === 0) sign = Math.sign(cr);
          expect(Math.sign(cr)).toBe(sign);
        }
      }
      const lay = fragmentLayout(p, pieces);
      expect(p.copies).toBeGreaterThanOrEqual(4);
      modes.add(p.mode);
      let spread = 0;
      for (let k = 0; k < pieces.length; k++) {
        const e = lay.find((l) => l.piece === k && l.copy === 0)!;
        const cx = pieces[k].reduce((s, q) => s + q[0], 0) / pieces[k].length - 0.5;
        const cy = pieces[k].reduce((s, q) => s + q[1], 0) / pieces[k].length - 0.5;
        spread += Math.hypot(e.base[0], e.base[1]) - Math.hypot(cx, cy);
      }
      expect(spread).toBeGreaterThan(0);
      let off = 0;
      for (const e of lay) if (e.jittered) off++;
      if (p.mode === 'pattern') expect(off).toBe(0);
      else expect(off).toBeGreaterThan(0);
    }
    expect([...modes].sort()).toEqual(['pattern', 'random']);
  });

});
