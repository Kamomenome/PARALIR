import { describe, expect, it } from 'vitest';
import { ATMOSPHERES, LIGHT_SHAPES, lightShape, renderAtmosphere } from '../../src/engine/space-v2/shared/atmosphere';
import { DEFAULT_SPACE_CONTROLS } from '../../src/engine/space-v2/types';
import { renderBackgroundOnly } from '../../src/engine/space-v2/world';
import { Hdr, tonemap } from '../../src/engine/space-v2/shared/hdr';
import { solid } from '../helpers/images';
import { readPngRgb } from '../helpers/png';
import { realPhoto } from '../helpers/realPhoto';
import { luminance, quantile, render, spaceWorld } from '../helpers/space';

const photo = readPngRgb('tests/fixtures/images/scene.png');
const W = 320;
const H = 240;
const look = { glow: 0.5, fog: 0.5 };

describe('the 002 Phase 9 background (003 FR-314, SC-313)', () => {
  it('the seed picks the light field, the celestial sphere and the nested photo', async () => {
    const kinds = new Set<string>();
    for (let variation = 0; variation < 60; variation++) kinds.add((await spaceWorld(photo, { variation })).world.atmosphere.kind);
    expect([...kinds].sort()).toEqual([...ATMOSPHERES].sort());
  });

  it('the light takes several shapes; round is a minority (SC-314)', async () => {
    const n = new Map<string, number>();
    for (let variation = 0; variation < 60; variation++) {
      const s = (await spaceWorld(photo, { variation })).world.atmosphere.shape.kind;
      n.set(s, (n.get(s) ?? 0) + 1);
    }
    expect([...n.keys()].sort()).toEqual([...LIGHT_SHAPES].sort());
    expect(n.get('ring')! / 60).toBeLessThanOrEqual(0.35);
  });

  it('edge and band light is straight: constant along lines parallel to the edge or band, no void (SC-314)', async () => {
    const seen = new Set<string>();
    for (let variation = 0; variation < 60 && seen.size < 2; variation++) {
      const a = (await spaceWorld(photo, { variation })).world.atmosphere;
      if (a.shape.kind === 'ring' || seen.has(a.shape.kind)) continue;
      seen.add(a.shape.kind);
      const dir = a.shape.angle;
      for (const [x0, y0] of [[100, 80], [200, 150], [60, 200]]) {
        const ref = lightShape(a, x0, y0, W, H);
        expect(ref.voidFactor).toBe(1);
        for (const t of [-40, -15, 20, 50]) {
          const p = lightShape(a, x0 + t * Math.cos(dir), y0 + t * Math.sin(dir), W, H);
          expect(p.intensity, `${a.shape.kind}`).toBeCloseTo(ref.intensity, 9);
        }
      }
    }
    expect(seen.size).toBe(2);
  });

  // Thresholds judged on the real photo (local only, 009 FR-922).
  it.skipIf(!realPhoto).each(ATMOSPHERES.map((k) => [k]))('%s: round light keeps the dark void and glow; every shape glows', async (kind) => {
    const photo = realPhoto!;
    for (const variation of [0, 1, 2]) {
      const w = await spaceWorld(photo, { variation });
      for (const shape of LIGHT_SHAPES) {
      const a = { ...w.world.atmosphere, kind, shape: { ...w.world.atmosphere.shape, kind: shape } };
      const y = luminance(renderBackgroundOnly(a, photo, DEFAULT_SPACE_CONTROLS, W, H));
      const median = quantile(y, 0.5);
      const [vx, vy] = a.layout.voidCenter;
      const ci = Math.round(120 + vy * 120);
      const cj = Math.round(160 + vx * 120);
      const centre: number[] = [];
      for (let i = Math.max(0, ci - 24); i < Math.min(H, ci + 24); i++) for (let j = Math.max(0, cj - 32); j < Math.min(W, cj + 32); j++) centre.push(y[i * W + j]);
      if (shape === 'ring') expect(quantile(centre, 0.1), `v${variation} void`).toBeLessThanOrEqual(0.35 * median);
      expect(quantile(y, 0.99), `v${variation} ${shape} glow`).toBeGreaterThanOrEqual(0.7);
      expect(quantile(y, 0.99), `v${variation} ${shape} ratio`).toBeGreaterThanOrEqual(2.5 * median);
      }
    }
  });

  it('black photo → black, deterministic', async () => {
    const w = await spaceWorld(solid(16, 12, [0, 0, 0]));
    const hdr = new Hdr(W, H);
    renderAtmosphere(hdr, w.world.atmosphere, w.img, look, 0.3);
    let mx = 0;
    tonemap(hdr, 1.5).forEach((v, i) => {
      if (i % 4 !== 3) mx = Math.max(mx, v);
    });
    expect(mx).toBeLessThanOrEqual(2);
    const p = await spaceWorld(photo, { variation: 3 });
    const a = new Hdr(W, H);
    const b = new Hdr(W, H);
    renderAtmosphere(a, p.world.atmosphere, photo, look, 0.3);
    renderAtmosphere(b, p.world.atmosphere, photo, look, 0.3);
    expect(Buffer.compare(Buffer.from(a.r.buffer), Buffer.from(b.r.buffer))).toBe(0);
  });

  it('the front stays readable over it (object pixels not swallowed)', async () => {
    for (const variation of [0, 1, 2, 3]) {
      const w = await spaceWorld(photo, { variation });
      for (const type of ['copies', 'split'] as const) {
        if (type === 'split' && !w.world.hasSubject) continue;
        const r = render(w, W, H, type);
        const y = luminance(r.rgba);
        const on: number[] = [];
        for (let i = 0; i < y.length; i++) if (r.objects![i] > 0.9) on.push(y[i]);
        expect(on.length, `v${variation} ${type}`).toBeGreaterThan(0.02 * y.length);
        expect(quantile(on, 0.5), `v${variation} ${type}`).toBeGreaterThanOrEqual(0.15);
      }
    }
  });
});
