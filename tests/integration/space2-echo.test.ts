import { describe, expect, it } from 'vitest';
import { framePhoto, grow, regionMask, toRgba } from '../../src/engine/space-v2/shared/inplace';
import { echoLayout } from '../../src/engine/space-v2/worlds/echo/echo';
import { mainObject } from '../../src/engine/space-v2/shared/object';
import { readPngRgb } from '../helpers/png';
import { render, spaceWorld } from '../helpers/space';
import { figurePhoto } from '../helpers/space2';

const photo = readPngRgb('tests/fixtures/images/scene.png');
const W = 320;
const H = 240;

describe('the subject filled with itself, the photo kept (003 FR-318, SC-317)', () => {
  it('the seed picks the self-filling', async () => {
    let n = 0;
    for (let variation = 0; variation < 60; variation++) if ((await spaceWorld(photo, { variation })).world.type === 'echo') n++;
    expect(n).toBeGreaterThan(0);
  });

  it('rows and spirals of copies, all inside the outline; spirals keep their ratio and turn', async () => {
    for (const img of [photo, figurePhoto(320, 240)]) {
      for (const variation of [0, 1, 2, 3]) {
        const w = await spaceWorld(img, { variation });
        const obj = mainObject(w.img, w.features);
        const { copies } = echoLayout(w.world.echo, obj, w.img, W, H);
        const region = regionMask(obj, w.img, W, H);
        expect(copies.length, `v${variation} count`).toBeGreaterThanOrEqual(12);
        expect(new Set(copies.map((c) => c.kind)), `v${variation} kinds`).toEqual(new Set(['row', 'spiral']));
        for (const c of copies) expect(region[Math.round(c.cy) * W + Math.round(c.cx)], `v${variation} inside`).toBeGreaterThan(0.3);
        for (const s of new Set(copies.map((c) => c.strand))) {
          const run = copies.filter((c) => c.strand === s).sort((a, b) => a.k - b.k);
          if (run[0].kind === 'row') {
            for (const c of run) expect(c.size).toBeCloseTo(run[0].size, 9);
            continue;
          }
          for (let k = 1; k + 1 < run.length; k++) {
            expect(run[k + 1].size / run[k].size).toBeCloseTo(run[1].size / run[0].size, 9);
            expect(run[k + 1].angle - run[k].angle).toBeCloseTo(run[1].angle - run[0].angle, 9);
          }
        }
      }
    }
  });

  it('nothing outside the outline; away from the subject the photo is untouched', async () => {
    for (const img of [photo, figurePhoto(320, 240)]) {
      for (const variation of [0, 1]) {
        const w = await spaceWorld(img, { variation });
        const r = render(w, W, H, 'echo');
        const ref = toRgba(framePhoto(w.img, W, H), W, H);
        const region = regionMask(mainObject(w.img, w.features), w.img, W, H);
        const edge = grow(region.map((v) => (v > 0.02 ? 1 : 0)), W, H, Math.round(0.02 * H));
        const near = grow(region.map((v) => (v > 0.02 ? 1 : 0)), W, H, Math.round(0.08 * H));
        let outside = 0;
        let far = 0;
        let farN = 0;
        for (let i = 0; i < W * H; i++) {
          if (edge[i] === 0) outside = Math.max(outside, r.objects![i]);
          if (near[i] === 0) {
            far += (Math.abs(r.rgba[4 * i] - ref[4 * i]) + Math.abs(r.rgba[4 * i + 1] - ref[4 * i + 1]) + Math.abs(r.rgba[4 * i + 2] - ref[4 * i + 2])) / (3 * 255);
            farN++;
          }
        }
        expect(outside, `v${variation} outline`).toBe(0);
        if (farN > 0) expect(far / farN, `v${variation} photo kept`).toBeLessThanOrEqual(0.02);
      }
    }
  });
});
