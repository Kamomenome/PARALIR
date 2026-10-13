import { analyze } from '../../src/engine/common/analysis/features';
import { pixelHash } from '../../src/engine/common/hash/sha256';
import type { RgbImage } from '../../src/engine/common/image/normalize';
import { buildSpaceSeedInput, deriveSpaceSeeds } from '../../src/engine/space-v2/seeds';
import { DEFAULT_SPACE_CONTROLS, type SpaceControls } from '../../src/engine/space-v2/types';
import { composeWorld, renderWorld, type WorldType } from '../../src/engine/space-v2/world';
import type { TimeSnapshot } from '../../src/engine/common/time/snapshot';

/** A fixed artwork time for tests. */
export const TEST_TIME: TimeSnapshot = {
  instantEpochMs: '1791689696789',
  localDateTime: '2026-10-11T12:34:56.789',
  timeZone: 'Asia/Tokyo',
  offsetMinutes: 540,
  resolution: 'exact',
};

export async function spaceWorld(img: RgbImage, opts: { variation?: number; controls?: Partial<SpaceControls> } = {}) {
  const features = analyze(img);
  const seeds = await deriveSpaceSeeds(buildSpaceSeedInput(await pixelHash(img), TEST_TIME, opts.variation ?? 0));
  const controls = { ...DEFAULT_SPACE_CONTROLS, ...opts.controls };
  const world = await composeWorld(seeds, features, controls, img);
  return { img, features, seeds, controls, world };
}

export function render(w: Awaited<ReturnType<typeof spaceWorld>>, W: number, H: number, type?: WorldType) {
  return renderWorld(w.world, w.img, w.features, w.controls, W, H, type);
}

export function luminance(rgba: Uint8ClampedArray): Float64Array {
  const n = rgba.length / 4;
  const y = new Float64Array(n);
  for (let p = 0; p < n; p++) y[p] = (0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2]) / 255;
  return y;
}

/**
 * Hue spread of the brighter pixels: 1 - |mean of unit hue vectors| weighted by chroma
 * (0 = one hue only, towards 1 = many hues). Pixels darker than `minLum` are ignored.
 */
export function brightHueSpread(rgba: Uint8ClampedArray, minLum = 0.35): number {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let p = 0; p < rgba.length / 4; p++) {
    const r = rgba[p * 4] / 255;
    const g = rgba[p * 4 + 1] / 255;
    const b = rgba[p * 4 + 2] / 255;
    if (0.299 * r + 0.587 * g + 0.114 * b < minLum) continue;
    const i = 0.596 * r - 0.274 * g - 0.322 * b;
    const q = 0.211 * r - 0.523 * g + 0.312 * b;
    const c = Math.hypot(i, q);
    if (c < 0.02) continue;
    sx += i;
    sy += q;
    sw += c;
  }
  return sw > 0 ? 1 - Math.hypot(sx, sy) / sw : 0;
}

export function quantile(values: ArrayLike<number>, q: number): number {
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}

