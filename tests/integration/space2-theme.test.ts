import { describe, expect, it } from 'vitest';
import { framePhoto, regionMask, toRgba } from '../../src/engine/space-v2/shared/inplace';
import { mosaicLayout } from '../../src/engine/space-v2/worlds/mosaic/mosaic';
import { mosaicObject } from '../../src/engine/space-v2/shared/object';
import { renderSpace } from '../../src/engine/space-v2/p9/composite';
import { DEFAULT_SPACE_CONTROLS as P9_CONTROLS } from '../../src/engine/space-v2/p9/types';
import { themeBase } from '../../src/engine/space-v2/worlds/theme/theme';
import { readPngRgb } from '../helpers/png';
import { render, spaceWorld } from '../helpers/space';
import { figurePhoto } from '../helpers/space2';

const photo = readPngRgb('tests/fixtures/images/scene.png');
const W = 320;
const H = 240;
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray, i: number) => (Math.abs(a[4 * i] - b[4 * i]) + Math.abs(a[4 * i + 1] - b[4 * i + 1]) + Math.abs(a[4 * i + 2] - b[4 * i + 2])) / (3 * 255);

describe('the theme world: the liked Phase 9 picture, with a part of the photo kept as the theme (005 FR-502, FR-503, SC-502)', () => {
  it('the seed picks the theme world', async () => {
    let n = 0;
    for (let variation = 0; variation < 60; variation++) if ((await spaceWorld(photo, { variation })).world.type === 'theme') n++;
    expect(n).toBeGreaterThan(0);
  });

  it('where no theme rectangle is drawn the Phase 9 picture; in it the photo, rebuilt from rectangles', { timeout: 120_000 }, async () => {
    for (const img of [photo, figurePhoto(320, 240)]) {
      for (const variation of [0, 1]) {
        const w = await spaceWorld(img, { variation });
        const r = render(w, W, H, 'theme').rgba;
        const t = w.world.theme;
        const base = renderSpace(t.p9, w.img, w.features, P9_CONTROLS, 'composite', W, H, { quality: 0.4, pipeline: { foreground: t.foreground, merge: 'depth' } }).rgba;
        const obj = mosaicObject(w.img, w.features, null);
        const region = regionMask(obj, w.img, W, H);
        const covered = render(w, W, H, 'theme').objects!;
        let far = 0;
        let farN = 0;
        let inner = 0;
        let innerN = 0;
        for (let i = 0; i < W * H; i++) {
          if (covered[i] === 0) {
            far += diff(r, base, i);
            farN++;
          } else if (region[i] > 0.5) {
            inner += diff(r, base, i);
            innerN++;
          }
        }
        expect(far / farN, `v${variation} Phase 9 kept`).toBeLessThanOrEqual(0.002);
        expect(inner / innerN, `v${variation} theme differs`).toBeGreaterThanOrEqual(0.08);
        // A rectangle left in place shows the photo's own pixels there.
        const still = toRgba(framePhoto(w.img, W, H), W, H);
        const keep = mosaicLayout(w.world.mosaic, obj, w.img, W, H).tiles.filter((k) => k.kind === 'keep' && !k.drop);
        let checked = 0;
        for (const k of keep) {
          const x = Math.round((k.x0 + k.x1) / 2);
          const y = Math.round((k.y0 + k.y1) / 2);
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || k.x1 - k.x0 < 6 || k.y1 - k.y0 < 6) continue;
          // Only where no later rectangle covers it: compare against the photo when it matches either.
          if (diff(r, still, y * W + x) <= 2 / 255) checked++;
        }
        expect(checked, `v${variation} photo pixels`).toBeGreaterThan(0);
      }
    }
  });

  it('not only round light: the seed picks a ring, light from an edge or bands; only the ring has the dark void (005 FR-507, SC-506)', { timeout: 300_000 }, async () => {
    const kinds: Record<string, number> = { ring: 0, edge: 0, band: 0 };
    const pick: Record<string, number> = {};
    for (let variation = 0; variation < 60; variation++) {
      const k = (await spaceWorld(photo, { variation })).world.theme.shape.kind;
      kinds[k]++;
      pick[k] ??= variation;
    }
    expect(kinds.ring).toBeGreaterThan(0);
    expect(kinds.edge).toBeGreaterThan(0);
    expect(kinds.band).toBeGreaterThan(0);
    expect(kinds.ring / 60).toBeLessThanOrEqual(0.35);
    const w0 = 160;
    const h0 = 120;
    for (const kind of ['edge', 'band', 'ring']) {
      const w = await spaceWorld(photo, { variation: pick[kind] });
      if (kind !== 'ring') expect(['surface', 'kaleidoscope'], `${kind}: not a radial foreground`).not.toContain(w.world.theme.foreground);
      const base = themeBase(w.world.theme, w.img, w.features, w0, h0, 0.4);
      const [vx, vy] = w.world.theme.p9.layout.voidCenter;
      const cx = w0 / 2 + (vx * h0) / 2;
      const cy = h0 / 2 + (vy * h0) / 2;
      const r0 = (w.world.theme.p9.voidRadius * h0) / 2;
      let disk = 0;
      let diskN = 0;
      let ring = 0;
      let ringN = 0;
      for (let y = 0; y < h0; y++) {
        for (let x = 0; x < w0; x++) {
          const i = y * w0 + x;
          const l = 0.2126 * base.r[i] + 0.7152 * base.g[i] + 0.0722 * base.b[i];
          const d = Math.hypot(x - cx, y - cy);
          if (d < 0.6 * r0) {
            disk += l;
            diskN++;
          } else if (d > 1.5 * r0 && d < 2.5 * r0) {
            ring += l;
            ringN++;
          }
        }
      }
      const ratio = diskN && ringN ? disk / diskN / (ring / ringN) : 1;
      if (kind === 'ring') expect(ratio, 'ring: a dark void').toBeLessThan(0.5);
      else expect(ratio, `${kind}: no void`).toBeGreaterThanOrEqual(0.5);
    }
  });
});

