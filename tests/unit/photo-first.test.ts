import { describe, expect, it } from 'vitest';
import { createInitialState, firstLook, prepareSource, withSource } from '../../src/app/state';
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

  it('「変える」 (no change of its own) shows the world as it is (013 FR-1307)', async () => {
    const s = await photo();
    const t = await firstLook(s, (x) => x);
    expect(t.showing).toBe('world');
    expect(t.variationIndex).toBe(0);
  });

  it('any other first action shows the world and does its change', async () => {
    const s = await photo();
    const t = await firstLook(s, (x) => ({ ...x, spaceType: 'mosaic' }), true);
    expect(t.showing).toBe('world');
    expect(t.spaceType).toBe('mosaic');
  });
});
