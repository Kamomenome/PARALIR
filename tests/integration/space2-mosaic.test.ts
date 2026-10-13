import { describe, expect, it } from 'vitest';
import { framePhoto, grow, regionMask, toRgba } from '../../src/engine/space-v2/shared/inplace';
import { mosaicLayout } from '../../src/engine/space-v2/worlds/mosaic/mosaic';
import { mainObject } from '../../src/engine/space-v2/shared/object';
import { readPngRgb } from '../helpers/png';
import { render, spaceWorld } from '../helpers/space';
import { figurePhoto } from '../helpers/space2';

const photo = readPngRgb('tests/fixtures/images/scene.png');
const W = 320;
const H = 240;

describe('the subject rebuilt from rectangles, the photo kept (003 FR-317, SC-316)', () => {
  it('the seed picks the rectangles', async () => {
    let n = 0;
    for (let variation = 0; variation < 60; variation++) if ((await spaceWorld(photo, { variation })).world.type === 'mosaic') n++;
    expect(n).toBeGreaterThan(0);
  });

  it('large and small rectangles, most shifted, some swapped, some magnified', async () => {
    for (const img of [photo, figurePhoto(320, 240)]) {
      for (const variation of [0, 1, 2, 3]) {
        const w = await spaceWorld(img, { variation });
        const { tiles } = mosaicLayout(w.world.mosaic, mainObject(w.img, w.features), w.img, W, H);
        const drawn = tiles.filter((t) => !t.drop);
        expect(drawn.length, `v${variation} count`).toBeGreaterThanOrEqual(30);
        const areas = drawn.map((t) => (t.x1 - t.x0) * (t.y1 - t.y0));
        expect(Math.max(...areas) / Math.min(...areas), `v${variation} sizes`).toBeGreaterThanOrEqual(16);
        expect(drawn.filter((t) => t.kind !== 'keep').length, `v${variation} shifted`).toBeGreaterThanOrEqual(drawn.length / 2);
        expect(drawn.some((t) => t.kind === 'swap'), `v${variation} swap`).toBe(true);
        expect(drawn.some((t) => t.kind === 'zoom'), `v${variation} zoom`).toBe(true);
      }
    }
  });

  it('away from the subject the photo is untouched; inside it is rebuilt', async () => {
    for (const img of [photo, figurePhoto(320, 240)]) {
      for (const variation of [0, 1]) {
        const w = await spaceWorld(img, { variation });
        const r = render(w, W, H, 'mosaic').rgba;
        const ref = toRgba(framePhoto(w.img, W, H), W, H);
        const region = regionMask(mainObject(w.img, w.features), w.img, W, H);
        const near = grow(region.map((v) => (v > 0.1 ? 1 : 0)), W, H, Math.round(0.08 * H));
        let far = 0;
        let farN = 0;
        let inner = 0;
        let innerN = 0;
        for (let i = 0; i < W * H; i++) {
          const d = (Math.abs(r[4 * i] - ref[4 * i]) + Math.abs(r[4 * i + 1] - ref[4 * i + 1]) + Math.abs(r[4 * i + 2] - ref[4 * i + 2])) / (3 * 255);
          if (near[i] === 0) {
            far += d;
            farN++;
          } else if (region[i] > 0.5) {
            inner += d;
            innerN++;
          }
        }
        if (farN > 0) expect(far / farN, `v${variation} photo kept`).toBeLessThanOrEqual(0.02);
        expect(inner / innerN, `v${variation} rebuilt`).toBeGreaterThanOrEqual(0.08);
      }
    }
  });
});
