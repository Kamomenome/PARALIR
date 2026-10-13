import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, reseed, setLasso, usePartsProvider, withSource } from '../../src/app/state';
import { lassoRange, type Lasso } from '../../src/engine/common/parts/lasso';
import type { PhotoParts } from '../../src/engine/common/parts/types';
import { CURRENT_ENGINE, loadEngine } from '../../src/engine/engines';
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

describe('the range never goes beyond the lasso (019 FR-1915, SC-1907)', () => {
  afterEach(() => usePartsProvider(null));

  it('the inside rule keeps only what is circled; the rule before keeps the whole cut-out', () => {
    const inside = lassoRange(loop, parts, [], W, H, true);
    expect(inside.source).toBe('lasso+ai');
    expect(at(inside.mask, 35, 44)).toBeGreaterThan(127);
    expect(at(inside.mask, 105, 65)).toBe(0);
    // Not the lasso's own shape: the AI's outline inside it.
    expect(at(inside.mask, 18, 26)).toBe(0);
    const before = lassoRange(loop, parts, [], W, H);
    expect(at(before.mask, 105, 65)).toBeGreaterThan(127);
    // No AI: the lasso itself, both ways.
    expect(lassoRange(loop, null, [], W, H, true).mask).toEqual(lassoRange(loop, null, [], W, H).mask);
  });

  it('the current engine cuts to the lasso; works of the frozen engines keep the rule they were made with', async () => {
    expect((await loadEngine(CURRENT_ENGINE)).lassoRule).toBe('inside');
    for (const id of ['space-v2-1', 'space-v2-2', 'space-v2-3', 'space-v2-4']) expect((await loadEngine(id)).lassoRule, id).toBeUndefined();
    usePartsProvider(async () => ({ status: 'ok', parts, ms: 0 }));
    const img = readPngRgb('tests/fixtures/images/scene.png');
    const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'b'.repeat(64) as any, fileBytes: 1, hadTransparency: false });
    const s = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
    const now = (await setLasso(s, loop)).spaceRange!;
    expect(at(now.mask, 105, 65)).toBe(0);
    const old = (await setLasso(await reseed({ ...s, engineId: 'space-v2-4' }), loop)).spaceRange!;
    expect(at(old.mask, 105, 65)).toBeGreaterThan(127);
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

  it('the rectangles world draws differently at 0 and 1 from 0.5 (its version raised)', async () => {
    const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'c'.repeat(64) as any, fileBytes: 1, hadTransparency: false });
    const s = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
    const draw = (count: number) => renderWorld(s.spaceWorld as SpaceWorld, img, src.features, { ...s.spaceControls, count }, 160, 120, 'mosaic').rgba.join(',');
    expect(draw(0)).not.toBe(draw(0.5));
    expect((s.spaceWorld as SpaceWorld).algorithms).toMatchObject({ mosaic: 'mosaic-v4', theme: 'theme-v3' });
  });
});
