import { describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, withSource } from '../../src/app/state';
import { lightShapeFrom } from '../../src/engine/space-v2/shared/atmosphere';
import { labradorite, lattice } from '../../src/engine/space-v2/shared/spread';
import type { SpaceWorld } from '../../src/engine/space-v2/world';
import { copyInstances } from '../../src/engine/space-v2/worlds/copies/copies';
import { readPngRgb } from '../helpers/png';

/** Even uniforms for a seed (the engine's lattice hash). */
const uniforms = (seed: number, n: number) => Array.from({ length: n }, (_, j) => lattice(seed, j, 77));

describe('the light is round or chaotic, never straight (021 FR-2105 as changed, SC-2105)', () => {
  it('no edge or band light; every chaotic shape comes; the ring about one time in five', () => {
    const kinds = new Map<string, number>();
    for (let k = 0; k < 2000; k++) {
      const kind = lightShapeFrom(uniforms(k, 8), uniforms(k + 99_991, 8)).kind;
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
    expect([...kinds.keys()].sort()).toEqual(['cracks', 'flame', 'ring', 'scatter', 'swirl']);
    expect(kinds.get('ring')! / 2000).toBeGreaterThan(0.15);
    expect(kinds.get('ring')! / 2000).toBeLessThan(0.25);
  });
});

describe('the colours of what changed play like labradorite (021 FR-2108 as changed, SC-2108)', () => {
  it('weight 0 stays; a grey surface of weight 1 turns blue in places and gold in others', () => {
    const W = 96;
    const H = 72;
    const grey = new Uint8ClampedArray(W * H * 4).map((_, i) => (i % 4 === 3 ? 255 : 150));
    const none = labradorite(grey, new Float32Array(W * H), 1234, 1, W, H);
    expect([...none]).toEqual([...grey]);
    const out = labradorite(grey, new Float32Array(W * H).fill(1), 1234, 1, W, H);
    let blue = 0;
    let gold = 0;
    for (let i = 0; i < W * H; i++) {
      const [r, g, b] = [out[4 * i], out[4 * i + 1], out[4 * i + 2]];
      if (b > r + 40 && b > g) blue++;
      if (r > b + 40 && g > b + 20) gold++;
    }
    expect(blue).toBeGreaterThan(0);
    expect(gold).toBeGreaterThan(0);
  });
});

describe('the copies stay in the frame (021 FR-2109, SC-2109)', () => {
  it('at 変貌 1 half of them or more are in view', async () => {
    const img = readPngRgb('tests/fixtures/images/scene.png');
    const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'f'.repeat(64) as any, fileBytes: 1, hadTransparency: false });
    let s = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
    for (let v = 0; v < 6; v++) {
      const w = s.spaceWorld as SpaceWorld;
      const t = Math.tan(w.camera.fov / 2);
      const copies = copyInstances(w.copies, 1, 1).filter((c) => c.role === 'copy');
      const seen = copies.filter((c) => c.centre[2] > 0 && Math.abs(c.centre[0] / c.centre[2]) < (4 / 3) * t && Math.abs(c.centre[1] / c.centre[2]) < t);
      expect(seen.length / copies.length, `${w.copies.kind} v${v}`).toBeGreaterThanOrEqual(0.5);
      s = await (await import('../../src/app/state')).nextWorld(s);
    }
  });
});
