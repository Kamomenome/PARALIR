import { describe, expect, it } from 'vitest';
import { cleanPlate, framePhoto } from '../../src/engine/space-v2/shared/inplace';
import { mosaicObject } from '../../src/engine/space-v2/shared/object';
import { SPACE_ALGORITHM_VERSIONS } from '../../src/engine/space-v2/versions';
import { fillHole, holeOf } from '../../src/engine/space-v2/worlds/mosaic/fill';
import { mosaicLayout } from '../../src/engine/space-v2/worlds/mosaic/mosaic';
import { readPngRgb } from '../helpers/png';
import { spaceWorld } from '../helpers/space';

const photo = readPngRgb('tests/fixtures/images/scene.png');
const W = 320;
const H = 240;

describe("the rectangles' hole is filled with rectangles of the photo, not smoothed (015 FR-1504, SC-1503)", () => {
  it('almost all of the hole is covered by pasted rectangles', async () => {
    for (const variation of [0, 1, 2]) {
      for (const count of [0.5, 1]) {
        const w = await spaceWorld(photo, { variation });
        const obj = mosaicObject(w.img, w.features, null);
        const { region } = mosaicLayout(w.world.mosaic, obj, w.img, W, H, count);
        const cut = obj.source === 'estimate' ? 0.05 : 0.25;
        const hole = holeOf(region, W, H, cut);
        const plate = cleanPlate(framePhoto(w.img, W, H), region, W, H, cut);
        const { covered } = fillHole(framePhoto(w.img, W, H), hole, plate, w.world.mosaic.seed, W, H);
        let inHole = 0;
        let left = 0;
        for (let i = 0; i < W * H; i++) {
          if (hole[i] < 0.5) continue;
          inHole++;
          if (!covered[i]) left++;
        }
        expect(inHole, `v${variation} ${count}`).toBeGreaterThan(0);
        expect(left / inHole, `v${variation} ${count} left smooth`).toBeLessThan(0.05);
      }
    }
  });

  it('the rectangles world has a version after the smooth fill (mosaic-v3 in 015, raised since)', () => {
    expect(['mosaic-v1', 'mosaic-v2']).not.toContain(SPACE_ALGORITHM_VERSIONS.mosaic);
  });
});
