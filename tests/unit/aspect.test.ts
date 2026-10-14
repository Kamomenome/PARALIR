import { describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, withPhoto, withSource } from '../../src/app/state';
import { outputSize, previewSize } from '../../src/engine/common/output';
import { makeScene } from '../helpers/images';

describe('the picture keeps the photo’s shape (018 FR-1801, FR-1804, SC-1801)', () => {
  it('sizes from the shape: the long side is 2400 (export) or 960 (preview)', () => {
    expect(outputSize(3 / 2)).toEqual({ width: 2400, height: 1600 });
    expect(outputSize(2 / 3)).toEqual({ width: 1600, height: 2400 });
    expect(outputSize(1)).toEqual({ width: 2400, height: 2400 });
    expect(previewSize({ width: 2400, height: 1600 })).toEqual({ width: 960, height: 640 });
    expect(previewSize({ width: 2400, height: 1800 })).toEqual({ width: 960, height: 720 });
  });

  it('a photo sets the export size', async () => {
    const src = await prepareSource(1, { name: 'wide.png', img: makeScene(90, 60), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
    const s0 = createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo');
    const s = await withSource(withPhoto(s0, src), src);
    expect(s.output).toEqual({ width: 2400, height: 1600 });
  });
});
