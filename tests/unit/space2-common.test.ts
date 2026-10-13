import { describe, expect, it } from 'vitest';
import { toDisplay, newRgb } from '../../src/engine/space-v2/shared/color';
import { newLayer, renderPlates, type Plate } from '../../src/engine/space-v2/shared/plates';
import { buildSpaceSeedInput } from '../../src/engine/space-v2/seeds';
import { solid } from '../helpers/images';
import { TEST_TIME } from '../helpers/space';
import { hue, angleDiff } from '../helpers/space2';

describe('space-v2 common parts (003 T302)', () => {
  it('the seed input starts with space-v2', () => {
    expect(buildSpaceSeedInput('a'.repeat(64) as any, TEST_TIME, 3)[0]).toBe('space-v2');
  });

  it('a plate shows the photo unbent: a flat red photo gives a red plate, deterministically', () => {
    const img = solid(32, 24, [200, 30, 40]);
    const plate: Plate = { crop: [0.5, 0.5, 0.4], centre: [0, 0, 3], size: 0.8, right: [1, 0, 0], up: [0, 1, 0], mask: null, edge: [0, 0, 0] };
    const a = newLayer(64, 48);
    const b = newLayer(64, 48);
    renderPlates([plate], img, { fov: Math.PI / 3, roll: 0 }, a);
    renderPlates([plate], img, { fov: Math.PI / 3, roll: 0 }, b);
    expect(Buffer.compare(Buffer.from(a.r.buffer), Buffer.from(b.r.buffer))).toBe(0);
    const i = 24 * 64 + 32;
    expect(a.a[i]).toBeGreaterThan(0.99);
    expect(a.r[i]).toBeGreaterThan(a.g[i] * 5);
  });

  it('the display keeps hues', () => {
    const c = newRgb(1);
    c.r[0] = 3;
    c.g[0] = 1.2;
    c.b[0] = 0.3;
    const d = toDisplay(c, 1, 1);
    const src = hue(Math.pow(3 / 3, 1 / 2.2), Math.pow(1.2 / 3, 1 / 2.2), Math.pow(0.3 / 3, 1 / 2.2));
    expect(angleDiff(hue(d[0] / 255, d[1] / 255, d[2] / 255), src)).toBeLessThan(3);
  });
});
