import { describe, expect, it } from 'vitest';
import { createInitialState, nextWorld, prepareSource, setSpaceControls, setSpaceType, withSource, type AppState } from '../../src/app/state';
import type { SpaceWorld } from '../../src/engine/space-v2/world';
import { makeScene } from '../helpers/images';

async function spaceState(img = makeScene(64, 48), id = 1): Promise<AppState> {
  const s0 = createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo');
  const src = await prepareSource(id, { name: 'scene.png', img, fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
  return withSource(s0, src);
}


describe('space-v2 state (003 US2)', () => {
  it('a photo composes a world (the only mode, 006); another world changes the seed', async () => {
    const s = await spaceState();
    expect((s.spaceWorld as SpaceWorld | null)?.engineVersion).toBe('space-v2');
    expect(s.spaceSeeds?.seedInput[0]).toBe('space-v2');
    const t = await nextWorld(s);
    expect(t.spaceSeeds?.rootSeed).not.toBe(s.spaceSeeds?.rootSeed);
  });

  it('fixing a world type and moving sliders keep the composition (FR-309, FR-310)', async () => {
    const s = await spaceState();
    const t = setSpaceType(s, 'copies');
    expect(t.spaceWorld).toBe(s.spaceWorld);
    const u = setSpaceControls(t, { morph: 0.8 });
    expect(u.spaceWorld).toBe(s.spaceWorld);
    expect(u.spaceSeeds).toBe(s.spaceSeeds);
  });
});
