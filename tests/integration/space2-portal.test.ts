import { describe, expect, it } from 'vitest';
import { portalField } from '../../src/engine/space-v2/worlds/portal/portal';
import { solid } from '../helpers/images';
import { readPngRgb } from '../helpers/png';
import { luminance, quantile, render, spaceWorld } from '../helpers/space';
import { figurePhoto, maxChannel } from '../helpers/space2';

const photo = readPngRgb('tests/fixtures/images/scene.png');
const W = 320;
const H = 240;

describe('the portal world (003 FR-316, SC-315)', () => {
  it('the seed picks the portal', async () => {
    let n = 0;
    for (let variation = 0; variation < 60; variation++) if ((await spaceWorld(photo, { variation })).world.type === 'portal') n++;
    expect(n).toBeGreaterThan(0);
  });

  it('the gate is mirror-symmetric with two straight pillars of light', async () => {
    for (const variation of [0, 1, 2]) {
      const { world } = await spaceWorld(photo, { variation });
      const f = portalField(world.portal, photo, W, H);
      const lum = (i: number) => f.r[i] + f.g[i] + f.b[i];
      let diff = 0;
      let mean = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W / 2; x++) {
          diff += Math.abs(lum(y * W + x) - lum(y * W + (W - 1 - x)));
          mean += lum(y * W + x);
        }
      }
      expect(diff / mean, `v${variation} symmetry`).toBeLessThanOrEqual(0.02);
      // Pillars: on every row in the middle, the brightest column of each half sits at the same place.
      const cols: number[] = [];
      for (let y = Math.round(H * 0.3); y < Math.round(H * 0.7); y += 6) {
        let best = 0;
        let bx = 0;
        for (let x = 0; x < W / 2; x++) {
          if (lum(y * W + x) > best) {
            best = lum(y * W + x);
            bx = x;
          }
        }
        cols.push(bx);
      }
      for (const c of cols) expect(Math.abs(c - cols[0]), `v${variation} pillar`).toBeLessThanOrEqual(2);
    }
  });

  it('one large figure in the middle, dark against the gate, with a lit rim', async () => {
    for (const variation of [0, 1, 2]) {
      const w = await spaceWorld(figurePhoto(320, 240), { variation });
      const r = render(w, W, H, 'portal');
      const y = luminance(r.rgba);
      let cov = 0;
      let cx = 0;
      const inner: number[] = [];
      const rim: number[] = [];
      for (let i = 0; i < y.length; i++) {
        const a = r.objects![i];
        cov += a;
        cx += a * (i % W);
        if (a > 0.98) inner.push(y[i]);
        else if (a > 0.3 && a < 0.9) rim.push(y[i]);
      }
      expect(cov / y.length, `v${variation} coverage`).toBeGreaterThanOrEqual(0.05);
      expect(Math.abs(cx / cov / W - 0.5), `v${variation} centred`).toBeLessThanOrEqual(0.1);
      const field = portalField(w.world.portal, w.img, W, H);
      const gate: number[] = [];
      const disp = (v: number) => Math.pow(Math.min(1, v), 1 / 2.2);
      for (let i = 0; i < y.length; i++) if (r.objects![i] < 0.02 && field.inside[i] > 0.5) gate.push(disp(0.299 * field.r[i] + 0.587 * field.g[i] + 0.114 * field.b[i]));
      expect(quantile(inner, 0.5), `v${variation} silhouette`).toBeLessThanOrEqual(0.5 * quantile(gate, 0.5));
      expect(quantile(rim, 0.5), `v${variation} rim`).toBeGreaterThan(quantile(inner, 0.5));
    }
  });

  it('black photo → black; deterministic', async () => {
    expect(maxChannel(render(await spaceWorld(solid(48, 36, [0, 0, 0])), 96, 72, 'portal').rgba)).toBeLessThanOrEqual(2);
    const w = await spaceWorld(photo, { variation: 4 });
    const a = render(w, 120, 90, 'portal').rgba;
    const b = render(w, 120, 90, 'portal').rgba;
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });
});
