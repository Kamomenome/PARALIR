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

/** Labradorite's play of colour, in a ring: deep blue, blue, blue-green, green, gold, copper, violet (sRGB 0..255). */
const LABRADORITE: [number, number, number][] = [
  [24, 52, 170],
  [40, 120, 245],
  [0, 180, 175],
  [70, 200, 95],
  [235, 190, 45],
  [225, 110, 40],
  [140, 60, 215],
];

function paletteAt(t: number, out: number[]): void {
  const n = LABRADORITE.length;
  const x = (((t % 1) + 1) % 1) * n;
  const k = Math.floor(x);
  const f = x - k;
  const s = f * f * (3 - 2 * f);
  const a = LABRADORITE[k % n];
  const b = LABRADORITE[(k + 1) % n];
  for (let c = 0; c < 3; c++) out[c] = a[c] + (b[c] - a[c]) * s;
}

/**
 * The colours of what changed play like labradorite (021 FR-2108): a dark greyish body, and flashes of blue, green,
 * gold and violet in streaks and patches, the colour chosen by a film thickness that runs along lamellae (noise
 * stretched one way, its direction from the seed) and the photo's light. The flashes spread as `chaos` grows; the
 * photo's light and shade stay in them. Weight 0 leaves a pixel as it is.
 */
export function labradorite(rgba: Uint8ClampedArray, weight: Float32Array, seed: number, chaos: number, W: number, H: number): Uint8ClampedArray {
  const out = Uint8ClampedArray.from(rgba);
  const dir = 2 * Math.PI * lattice(seed, 0, 9);
  const cos = Math.cos(dir);
  const sin = Math.sin(dir);
  const phase = lattice(seed, 1, 9);
  const spread = 0.8 - 0.55 * Math.min(1, chaos);
  const amount = Math.min(1, 1.4 * chaos);
  const col = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const w = weight[i] * amount;
      if (w <= 0) continue;
      const r = rgba[4 * i];
      const g = rgba[4 * i + 1];
      const b = rgba[4 * i + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const u = (x * cos + y * sin) / H;
      const v = (-x * sin + y * cos) / H;
      // Lamellae: fine along one way, long the other.
      const film = 0.65 * valueNoise(seed, u * 2.2, v * 14) + 0.35 * valueNoise(seed + 5, u * 5, v * 30) + 0.5 * lum + phase;
      paletteAt(film, col);
      const flash = clip((valueNoise(seed + 11, u * 3, v * 3) * 0.7 + 0.3 * valueNoise(seed + 13, u * 9, v * 9) - spread) / 0.18 + 0.5, 0, 1);
      // The body: the photo's light and shade, dark and greyish.
      const body = 40 + 120 * lum;
      const glow = 0.35 + 1.15 * lum;
      for (let c = 0; c < 3; c++) {
        const o = c === 0 ? r : c === 1 ? g : b;
        const target = body * 0.85 + (col[c] * glow - body * 0.85) * flash;
        out[4 * i + c] = Math.round(o + (target - o) * w);
      }
    }
  }
  return out;
}

/**
 * Where the picture changed (021 FR-2108): the drawn things fully, the rest a little where it is no longer the photo
 * (the generated background, the broken parts), nothing where the photo is left as it was.
 */
export function changedWeight(world: Uint8ClampedArray, objects: Float32Array | null, img: RgbImage, W: number, H: number): Float32Array {
  const photo = toDisplay(framePhoto(img, W, H), W, H, false);
  const w = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = Math.abs(world[4 * i] - photo[4 * i]) + Math.abs(world[4 * i + 1] - photo[4 * i + 1]) + Math.abs(world[4 * i + 2] - photo[4 * i + 2]);
    const o = objects ? clip(objects[i], 0, 1) : 0;
    w[i] = o + (1 - o) * (d > 6 ? 0.4 : 0);
  }
  return w;
}
