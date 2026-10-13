import { describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, restorePrevious, setLasso, setSpaceControls, setSpaceType, withSource } from '../../src/app/state';
import { makeScene } from '../helpers/images';

async function photo() {
  const src = await prepareSource(1, { name: 'scene.png', img: makeScene(64, 48), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
  return withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
}

describe('ひとつ戻す undoes the last change (013 FR-1308, SC-1306)', () => {
  it('a new photo has nothing to undo', async () => {
    expect((await photo()).previous).toBeNull();
  });

  it('a slider: back to the value before; a run of the same slider is one step', async () => {
    const s = await photo();
    const a = await setSpaceControls(s, { light: 0.6 });
    const b = await setSpaceControls(a, { light: 0.7 });
    const c = await setSpaceControls(b, { light: 0.8 });
    const back = await restorePrevious(c);
    expect(back.spaceControls.light).toBe(s.spaceControls.light);
    expect(back.previous).toBeNull();
  });

  it('another slider after one is its own step', async () => {
    const s = await photo();
    const a = await setSpaceControls(s, { light: 0.9 });
    const b = await setSpaceControls(a, { size: 0.1 });
    const back = await restorePrevious(b);
    expect(back.spaceControls).toEqual({ ...s.spaceControls, light: 0.9 });
  });

  it('the world fixed on screen and the lasso', async () => {
    const s = await photo();
    expect((await restorePrevious(setSpaceType(s, 'mosaic'))).spaceType).toBe('auto');
    const lassoed = await setLasso(s, [[0.2, 0.2], [0.6, 0.2], [0.5, 0.7]]);
    expect(lassoed.spaceLassos).toHaveLength(1);
    const back = await restorePrevious(lassoed);
    expect(back.spaceLassos).toHaveLength(0);
    expect(back.spaceRange).toBeNull();
  });

  it('the same choice of world twice is two steps (only sliders run together)', async () => {
    const s = await photo();
    const a = setSpaceType(s, 'mosaic');
    const b = setSpaceType(a, 'theme');
    expect((await restorePrevious(b)).spaceType).toBe('mosaic');
  });
});
