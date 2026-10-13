import { describe, expect, it } from 'vitest';
import { lassoMask, lassoRange } from '../../src/engine/common/parts/lasso';
import { classAt, PART } from '../../src/engine/common/parts/types';
import { frameOf, regionMask } from '../../src/engine/space-v2/shared/inplace';
import { rangeObject } from '../../src/engine/space-v2/shared/object';
import { renderWorld } from '../../src/engine/space-v2/world';
import { figureParts } from '../helpers/parts';
import { spaceWorld } from '../helpers/space';
import { figurePhoto } from '../helpers/space2';

const W = 320;
const H = 240;
const iou = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let both = 0;
  let any = 0;
  for (let k = 0; k < a.length; k++) {
    const x = a[k] > 0.5;
    const y = b[k] > 0.5;
    if (x && y) both++;
    if (x || y) any++;
  }
  return both / any;
};
// A rough loop around the head of figurePhoto (head: centre 80/160, 32/120, radius 11/160 of the width).
const roughHead: [number, number][] = [[0.38, 0.1], [0.62, 0.12], [0.63, 0.45], [0.4, 0.44]];
const overSky: [number, number][] = [[0.02, 0.02], [0.2, 0.02], [0.2, 0.15], [0.02, 0.15]];

describe('the range from a rough lasso, its outline by the AI (005 FR-504, SC-503)', () => {
  it('a loop around the head becomes the AI head', async () => {
    const img = figurePhoto(320, 240);
    const parts = await figureParts();
    const r = lassoRange(roughHead, parts, []);
    expect(r.source).toBe('lasso+ai');
    const head = Uint8Array.from({ length: r.w * r.h }, (_, i) => {
      const c = classAt(parts, ((i % r.w) + 0.5) / r.w, (Math.floor(i / r.w) + 0.5) / r.h);
      return c === PART.faceSkin || c === PART.hair ? 1 : 0;
    });
    expect(iou(r.mask, head)).toBeGreaterThanOrEqual(0.9);
    // And the world's range follows it.
    const region = regionMask(rangeObject(img, r)!, img, W, H);
    const f = frameOf(img, W, H);
    const headFrame = Float32Array.from({ length: W * H }, (_, k) => {
      const c = classAt(parts, f.u0 + ((k % W) + 0.5) * f.du, f.v0 + (Math.floor(k / W) + 0.5) * f.dv);
      return c === PART.faceSkin || c === PART.hair ? 1 : 0;
    });
    expect(iou(region, headFrame)).toBeGreaterThanOrEqual(0.85);
  });

  it('nothing the AI found overlaps: the lasso itself; no parts: the lasso itself', async () => {
    const parts = await figureParts();
    const a = lassoRange(overSky, parts, []);
    expect(a.source).toBe('lasso');
    expect(iou(a.mask, lassoMask(overSky, a.w, a.h))).toBe(1);
    const b = lassoRange(roughHead, null, [], 160, 120);
    expect(b.source).toBe('lasso');
    expect(iou(b.mask, lassoMask(roughHead, 160, 120))).toBe(1);
  });

  it('the rectangles and the theme are drawn over the lassoed range', async () => {
    const w = await spaceWorld(figurePhoto(320, 240), { variation: 0 });
    const parts = await figureParts();
    const r = lassoRange(roughHead, parts, []);
    for (const type of ['mosaic', 'theme'] as const) {
      const a = renderWorld(w.world, w.img, w.features, w.controls, W, H, type, undefined, parts, r);
      const b = renderWorld(w.world, w.img, w.features, w.controls, W, H, type, undefined, parts, null);
      expect(Buffer.compare(Buffer.from(a.rgba), Buffer.from(b.rgba)), type).not.toBe(0);
      // Deterministic.
      const c = renderWorld(w.world, w.img, w.features, w.controls, W, H, type, undefined, parts, r);
      expect(Buffer.compare(Buffer.from(a.rgba), Buffer.from(c.rgba)), type).toBe(0);
    }
  });
});
