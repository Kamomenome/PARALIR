import { describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, withSource } from '../../src/app/state';
import { mainObject, rangeObject } from '../../src/engine/space-v2/shared/object';
import type { SpaceWorld } from '../../src/engine/space-v2/world';
import { copyInstances } from '../../src/engine/space-v2/worlds/copies/copies';
import { mosaicLayout, wilderMosaic } from '../../src/engine/space-v2/worlds/mosaic/mosaic';
import { wilderSplit } from '../../src/engine/space-v2/worlds/split/split';
import { readPngRgb } from '../helpers/png';

const img = readPngRgb('tests/fixtures/images/scene.png');

async function world(): Promise<SpaceWorld> {
  const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'e'.repeat(64) as any, fileBytes: 1, hadTransparency: false });
  return (await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src)).spaceWorld as SpaceWorld;
}

describe('変貌 beyond 0.5 is stronger, not finer (021 FR-2103 as changed, SC-2107)', () => {
  it('the copies, the pieces and the rectangles stay as many as at 0.5', async () => {
    const w = await world();
    expect(copyInstances(w.copies, 1, 1).length).toBe(copyInstances(w.copies, 1, 0).length);
    expect(wilderSplit(w.split, 1).pieces).toBe(w.split.pieces);
    const obj = rangeObject(img, { w: 160, h: 120, mask: Uint8Array.from({ length: 160 * 120 }, (_, i) => (i % 160 > 40 && i % 160 < 120 && i > 160 * 20 && i < 160 * 100 ? 255 : 0)) }) ?? mainObject(img, analyzeLess(), null);
    const n = (p: typeof w.mosaic) => mosaicLayout(p, obj, img, 320, 240).tiles.length;
    expect(n(wilderMosaic(w.mosaic, 1))).toBe(n(w.mosaic));
  });
});

function analyzeLess(): never {
  throw new Error('the test range is not empty');
}
