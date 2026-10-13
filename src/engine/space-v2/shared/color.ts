import { clip } from '../../common/math';

/** Linear-light colour planes of a frame. */
export interface Rgb3 {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

export const newRgb = (n: number): Rgb3 => ({ r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) });

export const srgbToLinear = (c: number) => Math.pow(clip(c, 0, 1), 2.2);
export const linearToSrgb = (c: number) => Math.pow(clip(c, 0, 1), 1 / 2.2);

/** Three box-blur passes (≈ Gaussian) on a single channel in place. */
export function blurChannel(ch: Float32Array, w: number, h: number, radius: number): void {
  const tmp = new Float32Array(ch.length);
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    const n = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const norm = 1 / (2 * radius + 1);
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => (horizontal ? l * w + i : i * w + l);
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[at(Math.min(n - 1, Math.max(0, k)))];
      for (let i = 0; i < n; i++) {
        dst[at(i)] = s * norm;
        s += src[at(Math.min(n - 1, i + radius + 1))] - src[at(Math.max(0, i - radius))];
      }
    }
  };
  for (let p = 0; p < 3; p++) {
    pass(ch, tmp, true);
    pass(tmp, ch, false);
  }
}

/**
 * Linear colour → RGBA8 for display. Light above 0.85 is compressed by one factor per pixel (a soft
 * shoulder), so hues are kept; `shoulder: false` shows the values as they are.
 */
export function toDisplay(c: Rgb3, W: number, H: number, shoulder = true): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    let k = 1;
    const m = Math.max(c.r[i], c.g[i], c.b[i]);
    if (shoulder && m > 0.85) k = (0.85 + 0.15 * (1 - Math.exp(-(m - 0.85) / 0.15))) / m;
    out[i * 4] = Math.round(linearToSrgb(c.r[i] * k) * 255);
    out[i * 4 + 1] = Math.round(linearToSrgb(c.g[i] * k) * 255);
    out[i * 4 + 2] = Math.round(linearToSrgb(c.b[i] * k) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** A deterministic value in [0, 1) for an integer (film grain without random numbers at render time). */
export function hash01(i: number): number {
  let x = (i ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Alpha-over of a layer (linear colour and coverage) onto a frame, with a brightness factor for the layer. */
export function over(dst: Rgb3, layer: { r: Float32Array; g: Float32Array; b: Float32Array; a: Float32Array }, k = 1): void {
  for (let i = 0; i < dst.r.length; i++) {
    const a = layer.a[i];
    if (a <= 0) continue;
    dst.r[i] = dst.r[i] * (1 - a) + layer.r[i] * k * a;
    dst.g[i] = dst.g[i] * (1 - a) + layer.g[i] * k * a;
    dst.b[i] = dst.b[i] * (1 - a) + layer.b[i] * k * a;
  }
}
