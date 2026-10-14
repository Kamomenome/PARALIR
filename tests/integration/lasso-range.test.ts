import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, setLasso, usePartsProvider, withSource } from '../../src/app/state';
import { lassoRange, type Lasso } from '../../src/engine/common/parts/lasso';
import type { PhotoParts } from '../../src/engine/common/parts/types';
import { renderWorld, type SpaceWorld } from '../../src/engine/space-v2/world';
import { mosaicLayout, type MosaicParams } from '../../src/engine/space-v2/worlds/mosaic/mosaic';
import { rangeObject } from '../../src/engine/space-v2/shared/object';
import { readPngRgb } from '../helpers/png';

const W = 160;
const H = 120;
const rect = (m: Uint8Array, x0: number, y0: number, x1: number, y1: number) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 255;
  return m;
};
/** The AI's cut-out holding two things: A, inside the loop, and B, far outside it (the 土偶 and the 埴輪). */
const both = rect(rect(new Uint8Array(W * H), 20, 29, 50, 59), 100, 60, 110, 70);
const loop: Lasso = [[0.1, 0.2], [0.35, 0.2], [0.35, 0.53], [0.1, 0.53]];
const parts: PhotoParts = { version: 'parts-v2', w: W, h: H, classes: null, person: null, object: null, cuts: [both], faces: [], digest: '0'.repeat(16) };
const at = (m: Uint8Array, x: number, y: number) => m[y * W + x];

describe('the range from a lasso is the AI candidate whole, as loose as it is (019 FR-1915 withdrawn, SC-1907)', () => {
  afterEach(() => usePartsProvider(null));

  it('a cut-out holding two things, one circled: both are the range', () => {
    const range = lassoRange(loop, parts, [], W, H);
    expect(range.source).toBe('lasso+ai');
    expect(at(range.mask, 35, 44)).toBeGreaterThan(127);
    expect(at(range.mask, 105, 65)).toBeGreaterThan(127);
  });

  it('the same through the app, with the AI', async () => {
    usePartsProvider(async () => ({ status: 'ok', parts, ms: 0 }));
    const img = readPngRgb('tests/fixtures/images/scene.png');
    const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'b'.repeat(64) as any, fileBytes: 1, hadTransparency: false });
    const s = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
    expect(at((await setLasso(s, loop)).spaceRange!.mask, 105, 65)).toBeGreaterThan(127);
  });
});

describe('長方形の数 from few large to many small (019 FR-1916, SC-1908)', () => {
  const img = readPngRgb('tests/fixtures/images/scene.png');
  const obj = rangeObject(img, { w: W, h: H, mask: rect(new Uint8Array(W * H), 40, 20, 120, 100) })!;
  const p: MosaicParams = { depth: 8, stop: 0.15, shift: 0.3, jitter: 0.08, swap: 0.2, zoom: 0.08, drop: 0.05, seed: 12345 };
  const tiles = (count: number) => mosaicLayout(p, obj, img, 320, 240, count).tiles.length;

  it('more rectangles as it grows, at 1 four times or more those at 0', () => {
    const [few, mid, many] = [tiles(0), tiles(0.5), tiles(1)];
    expect(few).toBeLessThan(mid);
    expect(mid).toBeLessThan(many);
    expect(many).toBeGreaterThanOrEqual(4 * few);
  });

  it('the rectangles world draws differently beyond 0.5 of 変貌, where the count follows it (021 FR-2103)', async () => {
    const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'c'.repeat(64) as any, fileBytes: 1, hadTransparency: false });
    const s = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
    const draw = (morph: number) => renderWorld(s.spaceWorld as SpaceWorld, img, src.features, { morph }, 160, 120, 'mosaic').rgba.join(',');
    expect(draw(1)).not.toBe(draw(0.5));
    expect((s.spaceWorld as SpaceWorld).algorithms).toMatchObject({ mosaic: 'mosaic-v4', theme: 'theme-v3' });
  });
});
