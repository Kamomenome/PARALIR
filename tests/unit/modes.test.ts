import { describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, settleMode, setSpaceType, withSource } from '../../src/app/state';
import { makeScene } from '../helpers/images';

describe('no おまかせ: the first photo settles on the drawn mode (013B FR-1311)', () => {
  it('the drawn mode is chosen, and a chosen mode stays', async () => {
    const src = await prepareSource(1, { name: 'scene.png', img: makeScene(64, 48), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
    const s = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
    expect(s.spaceType).toBe('auto');
    const settled = settleMode(s);
    expect(settled.spaceType).toBe(s.spaceWorld!.type);
    expect(settled.previous).toBe(s.previous);
    expect(settleMode(setSpaceType(s, 'mosaic')).spaceType).toBe('mosaic');
  });
});
