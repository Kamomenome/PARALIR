import { describe, expect, it } from 'vitest';
import { copyInstances } from '../../src/engine/space-v2/worlds/copies/copies';
import { projectedSize } from '../../src/engine/space-v2/shared/plates';
import { readPngRgb } from '../helpers/png';
import { spaceWorld } from '../helpers/space';

const photo = readPngRgb('tests/fixtures/images/scene.png');
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const len = (a: number[]) => Math.hypot(...a);
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

describe('world ① rigid copies (003 FR-302, SC-304, SC-305)', () => {
  it('every arrangement follows its rule; copies are rigid and readable', async () => {
    for (let variation = 0; variation < 60; variation++) {
      const { world } = await spaceWorld(photo, { variation });
      const p = world.copies;
      const inst = copyInstances(p);
      const copies = inst.filter((i) => i.role === 'copy');
      for (const c of copies) expect(c.size).toBeCloseTo(copies[0].size, 12);
      // Readable: one copy spans 8 % or more of the frame height (640×480).
      const sizes = copies.map((c) => projectedSize({ crop: [0.5, 0.5, 0.1], centre: c.centre, size: c.size, right: c.right, up: c.up, mask: null, edge: [0, 0, 0] }, world.camera, 640, 480));
      expect(Math.max(...sizes), `v${variation} ${p.kind} size`).toBeGreaterThanOrEqual(0.08 * 480);
      if (p.kind === 'ring') {
        const r0 = len(sub(copies[0].centre, p.centre));
        for (const c of copies) expect(len(sub(c.centre, p.centre))).toBeCloseTo(r0, 9);
        const d0 = len(sub(copies[0].centre, copies[1].centre));
        for (let k = 1; k + 1 < copies.length; k++) expect(len(sub(copies[k].centre, copies[k + 1].centre))).toBeCloseTo(d0, 9);
      } else if (p.kind === 'fan') {
        for (const c of copies) expect(len(sub(c.centre.map((v, i) => v - c.up[i] * c.size), p.centre))).toBeLessThan(1e-9);
      } else if (p.kind === 'column') {
        const a = copies[0].centre;
        const dir = sub(copies[copies.length - 1].centre, a);
        for (const c of copies) expect(len(cross(sub(c.centre, a), dir)) / len(dir) ** 2).toBeLessThan(1e-9);
      } else if (p.kind === 'grid') {
        const n = cross(sub(copies[1].centre, copies[0].centre), sub(copies[p.cols].centre, copies[0].centre));
        for (const c of copies) expect(Math.abs(n.reduce((t, v, i) => t + v * (c.centre[i] - copies[0].centre[i]), 0)) / len(n)).toBeLessThan(1e-9);
        const nearest = copies.map((a) => Math.min(...copies.filter((b) => b !== a).map((b) => len(sub(a.centre, b.centre)))));
        for (const d of nearest) expect(d).toBeCloseTo(nearest[0], 9);
      } else {
        const C = p.centre;
        const polar = copies.map((c) => [Math.hypot(c.centre[0] - C[0], c.centre[1] - C[1]), Math.atan2(c.centre[1] - C[1], c.centre[0] - C[0])]);
        const step = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
        for (let k = 1; k + 1 < polar.length; k++) {
          expect(polar[k + 1][0] / polar[k][0]).toBeCloseTo(polar[1][0] / polar[0][0], 9);
          expect(step(polar[k][1], polar[k + 1][1])).toBeCloseTo(step(polar[0][1], polar[1][1]), 9);
        }
      }
    }
  });

});
