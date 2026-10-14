import { describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, setLasso, setSpaceControls, withSource, type AppState } from '../../src/app/state';
import { lassoMask, type Lasso } from '../../src/engine/common/parts/lasso';
import { toDisplay } from '../../src/engine/space-v2/shared/color';
import { framePhoto } from '../../src/engine/space-v2/shared/inplace';
import { renderWorld, type SpaceWorld, type WorldType } from '../../src/engine/space-v2/world';
import { readPngRgb } from '../helpers/png';

const img = readPngRgb('tests/fixtures/images/scene.png');
const W = 160;
const H = 120;
const MODES: WorldType[] = ['copies', 'split', 'mosaic', 'echo', 'theme'];
const loop: Lasso = [[0.3, 0.3], [0.62, 0.28], [0.66, 0.62], [0.32, 0.66]];

async function work(): Promise<AppState> {
  const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'd'.repeat(64) as any, fileBytes: 1, hadTransparency: false });
  return setLasso(await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src), loop);
}
const draw = (s: AppState, type: WorldType, morph: number) =>
  renderWorld(s.spaceWorld as SpaceWorld, img, s.source!.features, setSpaceControls(s, { morph }).spaceControls, W, H, type, 0.3, null, s.spaceRange).rgba;
const photo = toDisplay(framePhoto(img, W, H), W, H, false);
/** Mean difference per pixel (0..255) between two pictures, over the pixels where `where` holds. */
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray, where: (i: number) => boolean = () => true) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!where(i)) continue;
    s += (Math.abs(a[4 * i] - b[4 * i]) + Math.abs(a[4 * i + 1] - b[4 * i + 1]) + Math.abs(a[4 * i + 2] - b[4 * i + 2])) / 3;
    n++;
  }
  return s / Math.max(1, n);
};

describe('変貌, the one slider (021 FR-2101–2104)', () => {
  it('starts at 0.5, the only control', async () => {
    const s = await work();
    expect(s.spaceControls).toEqual({ morph: 0.5 });
  });

  for (const type of MODES) {
    it(`${type}: 0 is the photo; at 0.25 the rest is further on its way than the subject; 0.75 and 1 go further from 0.5`, async () => {
      const s = await work();
      expect(diff(draw(s, type, 0), photo)).toBe(0);
      const subject = lassoMask(loop, W, H);
      const quarter = draw(s, type, 0.25);
      const half = draw(s, type, 0.5);
      // How far each part has gone of its way from the photo to the world (some modes leave the rest as the photo).
      const way = (at: (i: number) => boolean) => diff(quarter, photo, at) / Math.max(1e-9, diff(half, photo, at));
      const out = (i: number) => !subject[i];
      const inn = (i: number) => !!subject[i];
      expect(diff(half, photo, inn)).toBeGreaterThan(0);
      if (diff(half, photo, out) > 0.5) expect(way(out)).toBeGreaterThan(way(inn));
      expect(way(inn)).toBeLessThan(0.5);
      const d75 = diff(draw(s, type, 0.75), half);
      const d1 = diff(draw(s, type, 1), half);
      expect(d75).toBeGreaterThan(0);
      expect(d1).toBeGreaterThan(0);
      // The rectangles are cut anew at any change, so their difference levels off; the others grow wilder (SC-2103).
      if (type !== 'mosaic' && type !== 'theme') expect(d1).toBeGreaterThan(d75);
      // The same conditions, the same picture.
      expect(diff(draw(s, type, 0.8), draw(s, type, 0.8))).toBe(0);
    });
  }
});
