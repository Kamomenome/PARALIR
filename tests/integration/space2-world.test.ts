import { describe, expect, it } from 'vitest';
import { COPIES_KINDS } from '../../src/engine/space-v2/worlds/copies/copies';
import { framePhoto, toRgba } from '../../src/engine/space-v2/shared/inplace';
import { WORLD_TYPES, worldOdds, type WorldType } from '../../src/engine/space-v2/world';
import { solid } from '../helpers/images';
import { readPngRgb } from '../helpers/png';
import { render, spaceWorld } from '../helpers/space';
import { checker, maxChannel, thumb, tinted, worstHue } from '../helpers/space2';

const photo = readPngRgb('tests/fixtures/images/scene.png');

describe('space-v2: three worlds over a rebuilt background (003 US1)', () => {
  it('the seed picks every world, and every variation inside each (SC-303)', async () => {
    const types = new Set<string>();
    const inner = new Set<string>();
    for (let variation = 0; variation < 120; variation++) {
      const { world } = await spaceWorld(photo, { variation });
      if (variation < 40) types.add(world.type);
      inner.add(`copies:${world.copies.kind}`);
      inner.add(`atmos:${world.atmosphere.kind}`);
    }
    expect([...types].sort()).toEqual([...WORLD_TYPES].sort());
    for (const k of COPIES_KINDS) expect(inner.has(`copies:${k}`), k).toBe(true);
    for (const k of ['light', 'sphere', 'droste']) expect(inner.has(`atmos:${k}`), k).toBe(true);
  });

  it('variations differ in composition (SC-303)', async () => {
    const thumbs: Float64Array[] = [];
    for (let variation = 0; variation < 8; variation++) thumbs.push(thumb(render(await spaceWorld(photo, { variation }), 96, 72).rgba, 96, 72, 32, 24));
    // Cells left as the photo in both (worlds that keep the photo) are not part of the composition.
    const still = thumb(toRgba(framePhoto(photo, 96, 72), 96, 72), 96, 72, 32, 24);
    for (let a = 0; a < thumbs.length; a++) {
      for (let b = a + 1; b < thumbs.length; b++) {
        let d = 0;
        let n = 0;
        for (let k = 0; k < thumbs[a].length; k++) {
          if (Math.abs(thumbs[a][k] - still[k]) <= 0.01 && Math.abs(thumbs[b][k] - still[k]) <= 0.01) continue;
          d += Math.abs(thumbs[a][k] - thumbs[b][k]);
          n++;
        }
        expect(d / Math.max(1, n), `v${a} vs v${b}`).toBeGreaterThanOrEqual(0.04);
      }
    }
  });

  it('the split world needs a subject (SC-309; the darkness world is gone, 017)', () => {
    const share = (odds: [WorldType, number][], t: WorldType) => odds.find(([k]) => k === t)![1] / odds.reduce((s, [, w]) => s + w, 0);
    expect(share(worldOdds({ L: 0.45 }, false), 'split')).toBe(0);
  });

  it('a photo without a subject never gets the split world', async () => {
    for (let variation = 0; variation < 60; variation++) expect((await spaceWorld(checker(), { variation })).world.type).not.toBe('split');
  });

  it.each(WORLD_TYPES.map((t) => [t]))('%s: deterministic, black photo → black, red photo → red (natural colours) (SC-301, SC-302)', async (type: WorldType) => {
    const w = await spaceWorld(photo, { variation: 1 });
    const a = render(w, 120, 90, type).rgba;
    const b = render(w, 120, 90, type).rgba;
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
    expect(maxChannel(render(await spaceWorld(solid(48, 36, [0, 0, 0])), 96, 72, type).rgba)).toBeLessThanOrEqual(2);
    const red: [number, number, number] = [210, 40, 40];
    const rw = await spaceWorld(tinted(red));
    expect(worstHue(render(rw, 96, 72, type).rgba, red)).toBeLessThanOrEqual(30);
  });
});
