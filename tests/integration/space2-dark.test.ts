import { describe, expect, it } from 'vitest';
import { darkCount, darkLight } from '../../src/engine/space-v2/worlds/dark/dark';
import { readPngRgb } from '../helpers/png';
import { luminance, quantile, render, spaceWorld } from '../helpers/space';
import { realPhoto } from '../helpers/realPhoto';
import { figurePhoto } from '../helpers/space2';

const photo = readPngRgb('tests/fixtures/images/scene.png');

describe('world ② darkness and light (003 FR-303, SC-306)', () => {
  // The look was judged on the real photo (local only, 009 FR-922) and on a drawn figure.
  it.each([...(realPhoto ? [['the reference photo', realPhoto] as const] : []), ['a photo with a figure', figurePhoto(320, 240)] as const])('%s: dark frame, bright light, lit objects; in a beam the lit objects are in the beam', async (_n, img) => {
    const seen = new Set<string>();
    for (let variation = 0; variation < 40 && seen.size < 2; variation++) {
      const w = await spaceWorld(img, { variation });
      if (seen.has(w.world.dark.kind)) continue;
      seen.add(w.world.dark.kind);
      const W = 320;
      const H = 240;
      const r = render(w, W, H, 'dark');
      const y = luminance(r.rgba);
      expect(quantile(y, 0.5), `${w.world.dark.kind} median`).toBeLessThanOrEqual(0.08);
      expect(quantile(y, 0.99), `${w.world.dark.kind} light`).toBeGreaterThanOrEqual(0.5);
      let lit = 0;
      let inBeam = 0;
      const light = darkLight(w.world.dark, w.img, W, H, 1);
      for (let i = 0; i < y.length; i++) {
        if (r.objects![i] > 0.5 && y[i] >= 0.25) {
          lit++;
          if (Math.max(...light((i % W) + 0.5, Math.floor(i / W) + 0.5)) > 0.1) inBeam++;
        }
      }
      expect(lit / y.length, `${w.world.dark.kind} lit objects`).toBeGreaterThanOrEqual(0.01);
      if (w.world.dark.kind === 'beam') expect(inBeam / lit).toBeGreaterThanOrEqual(0.8);
    }
    expect(seen.size).toBe(2);
  });

  it('the count slider adds objects without moving the others', async () => {
    const w = await spaceWorld(photo, { variation: 0 });
    expect(darkCount(w.world.dark, 1)).toBeGreaterThan(darkCount(w.world.dark, 0));
    const few = await spaceWorld(photo, { variation: 0, controls: { count: 0 } });
    expect(JSON.stringify(few.world)).toBe(JSON.stringify(w.world));
  });
});
