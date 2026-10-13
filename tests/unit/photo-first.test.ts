import { describe, expect, it } from 'vitest';
import { createInitialState, firstLook, nextWorld, prepareSource, withSource } from '../../src/app/state';
import { makeScene } from '../helpers/images';

async function photo() {
  const src = await prepareSource(1, { name: 'scene.png', img: makeScene(64, 48), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
  return withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
}

describe('a new photo is shown as it is until the first action (011 FR-1101, FR-1102)', () => {
  it('a new photo shows the photo; the world is ready behind it', async () => {
    const s = await photo();
    expect(s.showing).toBe('photo');
    expect(s.spaceWorld).not.toBeNull();
  });

  it('the first 別の世界 shows variation 0; the next one moves on', async () => {
    const s = await photo();
    const t = await firstLook(s, nextWorld);
    expect(t.showing).toBe('world');
    expect(t.variationIndex).toBe(0);
    const u = await firstLook(t, nextWorld);
    expect(u.variationIndex).toBe(1);
  });

  it('any other first action shows the world and does its change', async () => {
    const s = await photo();
    const t = await firstLook(s, (x) => ({ ...x, spaceType: 'mosaic' }), true);
    expect(t.showing).toBe('world');
    expect(t.spaceType).toBe('mosaic');
  });
});
