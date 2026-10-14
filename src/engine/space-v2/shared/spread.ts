import type { RgbImage } from '../../common/image/normalize';
import { clip } from '../../common/math';
import { toDisplay } from './color';
import { blurChannel } from './hdr';
import { framePhoto, regionMask } from './inplace';
import type { PhotoObject } from './object';

/** A value in [0, 1) for a lattice point, from the seed (integer hash, the same everywhere). */
export function lattice(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1] at (x, y) in lattice units. */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = lattice(seed, x0, y0) + (lattice(seed, x0 + 1, y0) - lattice(seed, x0, y0)) * sx;
  const b = lattice(seed, x0, y0 + 1) + (lattice(seed, x0 + 1, y0 + 1) - lattice(seed, x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

/**
 * Where the other world comes first (021 FR-2102): 0..1 over the frame, evenly spread within each group (each value
 * covers the same share of the subject, and of the rest, whatever their light). Tangled noise from the seed, four
 * octaves, with the photo's light: bright places go a little later. Measured in heights, the same at any size.
 */
export function spreadField(seed: number, photo: Uint8ClampedArray, W: number, H: number, group: Uint8Array = new Uint8Array(W * H)): Float32Array {
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (0.2126 * photo[4 * i] + 0.7152 * photo[4 * i + 1] + 0.0722 * photo[4 * i + 2]) / 255;
  blurChannel(lum, W, H, Math.max(1, Math.round(0.02 * H)));
  const f = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (3 * x) / H;
      const v = (3 * y) / H;
      let n = 0;
      let amp = 0.5;
      let total = 0;
      for (let o = 0; o < 4; o++) {
        const k = 2 ** o;
        n += amp * valueNoise(seed + 977 * o, u * k, v * k);
        total += amp;
        amp *= 0.55;
      }
      f[y * W + x] = 0.7 * (n / total) + 0.3 * lum[y * W + x];
    }
  }
  // Even out within each group: the share of it below a value is that value (a histogram's running total).
  const bins = 1024;
  const bin = (v: number) => Math.min(bins, Math.floor(clip(v, 0, 1) * bins));
  for (const g of [0, 1]) {
    const hist = new Float64Array(bins + 1);
    let n = 0;
    for (let i = 0; i < W * H; i++) if (group[i] === g) (hist[bin(f[i])]++, n++);
    if (!n) continue;
    for (let b = 1; b <= bins; b++) hist[b] += hist[b - 1];
    for (let i = 0; i < W * H; i++) if (group[i] === g) f[i] = hist[bin(f[i])] / n;
  }
  return f;
}

/** How far the change has gone at u for a place of field value f: 0 the photo, 1 the world, a narrow soft edge between. */
const reach = (u: number, f: number) => clip((1.15 * u - f) / 0.1, 0, 1);

/**
 * 変貌 below 0.5 (021 FR-2102): the world spreads over the photo. `u` = 変貌 / 0.5: 0 is the photo, 1 the world. The
 * subject (the lasso's range, else the estimated one) starts once the rest is well under way (u past 0.4).
 */
export function spreadOver(world: Uint8ClampedArray, seed: number, obj: PhotoObject, img: RgbImage, W: number, H: number, u: number): Uint8ClampedArray {
  const photo = toDisplay(framePhoto(img, W, H), W, H, false);
  if (u <= 0) return photo;
  const subject = regionMask(obj, img, W, H);
  const field = spreadField(seed, photo, W, H, Uint8Array.from(subject, (v) => (v > 0.5 ? 1 : 0)));
  const us = clip((u - 0.4) / 0.6, 0, 1);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const rest = reach(u, field[i]);
    const a = rest + (reach(us, field[i]) - rest) * subject[i];
    for (let c = 0; c < 3; c++) out[4 * i + c] = Math.round(photo[4 * i + c] + (world[4 * i + c] - photo[4 * i + c]) * a);
    out[4 * i + 3] = 255;
  }
  return out;
}
