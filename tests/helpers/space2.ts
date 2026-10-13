import type { RgbImage } from '../../src/engine/common/image/normalize';
import { solid } from './images';
import { luminance } from './space';

export const hue = (r: number, g: number, b: number) => Math.atan2(0.211 * r - 0.523 * g + 0.312 * b, 0.596 * r - 0.274 * g - 0.322 * b);
export const angleDiff = (a: number, b: number) => (Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180) / Math.PI;

/** A flat colour with faint texture. */
export function tinted(rgb: [number, number, number]): RgbImage {
  const img = solid(48, 36, rgb);
  for (let p = 0; p < 48 * 36; p++) {
    const k = 0.85 + 0.15 * (((p * 7919) % 13) / 12);
    for (let c = 0; c < 3; c++) img.data[p * 3 + c] = Math.round(rgb[c] * k);
  }
  return img;
}

/** A textured backdrop with a red-and-skin figure in the middle (a photo with a subject). */
export function figurePhoto(W = 160, H = 120): RgbImage {
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = (x * 160) / W;
      const fy = (y * 120) / H;
      const head = (fx - 80) ** 2 + (fy - 32) ** 2 < 11 ** 2;
      const body = (fx >= 64 && fx < 96 && fy >= 44 && fy < 100) || (fy >= 48 && fy < 58 && fx >= 46 && fx < 114);
      const t = ((x * 7 + y * 13) % 9) / 8;
      const stripe = (x + y) % 6 < 2 ? 25 : 0;
      const c = head ? [225, 170, 140] : body ? [200, 40 + stripe, 50] : [70 + 30 * t, 110 + 25 * t, 80 + 20 * t];
      data.set(c.map(Math.round), (y * W + x) * 3);
    }
  }
  return { width: W, height: H, data };
}

/** A checkerboard: nothing stands out (no subject). */
export function checker(W = 160, H = 120): RgbImage {
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(((x >> 3) + (y >> 3)) % 2 ? [200, 60, 60] : [60, 60, 200], (y * W + x) * 3);
  return { width: W, height: H, data };
}

export function maxChannel(rgba: Uint8ClampedArray): number {
  let mx = 0;
  for (let p = 0; p < rgba.length; p += 4) mx = Math.max(mx, rgba[p], rgba[p + 1], rgba[p + 2]);
  return mx;
}

/** Worst hue deviation (degrees) of coloured pixels from a target hue. */
export function worstHue(rgba: Uint8ClampedArray, rgb: [number, number, number]): number {
  const target = hue(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  let worst = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    const r = rgba[p] / 255;
    const g = rgba[p + 1] / 255;
    const b = rgba[p + 2] / 255;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 0.08) continue;
    worst = Math.max(worst, angleDiff(hue(r, g, b), target));
  }
  return worst;
}

/** 16×12 block means of the luminance (the composition, not the detail). */
export function thumb(rgba: Uint8ClampedArray, W: number, H: number, gx = 16, gy = 12): Float64Array {
  const y = luminance(rgba);
  const t = new Float64Array(gx * gy);
  const bw = W / gx;
  const bh = H / gy;
  for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) t[Math.floor(i / bh) * gx + Math.floor(j / bw)] += y[i * W + j] / (bw * bh);
  return t;
}

/** Laplacian magnitude relative to mean brightness. */
export function relDetail(rgba: Uint8ClampedArray, W: number, H: number): number {
  const y = luminance(rgba);
  let s = 0;
  let m = 0;
  for (let i = 1; i < H - 1; i++) for (let j = 1; j < W - 1; j++) s += Math.abs(4 * y[i * W + j] - y[i * W + j - 1] - y[i * W + j + 1] - y[(i - 1) * W + j] - y[(i + 1) * W + j]);
  for (const v of y) m += v;
  return s / Math.max(m, 1e-9);
}
