import { clip, smoothstep } from '../../common/math';

/** Linear-light float RGB buffer. All operations run in a fixed order, so results are deterministic. */
export class Hdr {
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.r = new Float32Array(W * H);
    this.g = new Float32Array(W * H);
    this.b = new Float32Array(W * H);
  }
  add(x: number, y: number, r: number, g: number, b: number): void {
    const i = y * this.W + x;
    this.r[i] += r;
    this.g[i] += g;
    this.b[i] += b;
  }
  /** Alpha-over at pixel i: c = c*(1-a) + col*a. */
  over(i: number, r: number, g: number, b: number, a: number): void {
    this.r[i] = this.r[i] * (1 - a) + r * a;
    this.g[i] = this.g[i] * (1 - a) + g * a;
    this.b[i] = this.b[i] * (1 - a) + b * a;
  }
}

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

/** Glow: light above `threshold` is downsampled ×4, blurred and added back with `strength`. */
export function bloom(h: Hdr, threshold: number, strength: number, radiusFrac = 0.02): void {
  const f = 4;
  const w = Math.max(1, Math.ceil(h.W / f));
  const hh = Math.max(1, Math.ceil(h.H / f));
  const radius = Math.max(1, Math.round(w * radiusFrac));
  for (const ch of [h.r, h.g, h.b]) {
    const small = new Float32Array(w * hh);
    for (let y = 0; y < h.H; y++) {
      for (let x = 0; x < h.W; x++) {
        const v = ch[y * h.W + x] - threshold;
        if (v > 0) small[Math.floor(y / f) * w + Math.floor(x / f)] += v / (f * f);
      }
    }
    blurChannel(small, w, hh, radius);
    for (let y = 0; y < h.H; y++) {
      const sy = clip((y + 0.5) / f - 0.5, 0, hh - 1);
      const y0 = Math.floor(sy);
      const y1 = Math.min(hh - 1, y0 + 1);
      const fy = sy - y0;
      for (let x = 0; x < h.W; x++) {
        const sx = clip((x + 0.5) / f - 0.5, 0, w - 1);
        const x0 = Math.floor(sx);
        const x1 = Math.min(w - 1, x0 + 1);
        const fx = sx - x0;
        const v =
          (small[y0 * w + x0] * (1 - fx) + small[y0 * w + x1] * fx) * (1 - fy) +
          (small[y1 * w + x0] * (1 - fx) + small[y1 * w + x1] * fx) * fy;
        ch[y * h.W + x] += strength * v;
      }
    }
  }
}

/** Darkens towards the frame edges. */
export function vignette(h: Hdr, amount: number): void {
  for (let y = 0; y < h.H; y++) {
    for (let x = 0; x < h.W; x++) {
      const dx = (x + 0.5) / h.W - 0.5;
      const dy = (y + 0.5) / h.H - 0.5;
      const k = 1 - amount * Math.min(1, (dx * dx + dy * dy) * 2.2);
      const i = y * h.W + x;
      h.r[i] *= k;
      h.g[i] *= k;
      h.b[i] *= k;
    }
  }
}

const aces = (x: number) => clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1);

/**
 * Exposure and an ACES-style curve applied to the brightest channel, with all channels scaled by the
 * same factor, so the photo's hues are kept (Phase 5). Only very strong light whitens, towards the
 * grey of the same brightness (which does not rotate the hue). sRGB encoding, uint8 by truncation.
 */
export function tonemap(h: Hdr, exposure: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(h.W * h.H * 4);
  for (let i = 0; i < h.W * h.H; i++) {
    const r = Math.max(0, h.r[i]) * exposure;
    const g = Math.max(0, h.g[i]) * exposure;
    const b = Math.max(0, h.b[i]) * exposure;
    const m = Math.max(r, g, b);
    let or = 0;
    let og = 0;
    let ob = 0;
    if (m > 0) {
      const mm = aces(m);
      const k = mm / m;
      const white = 0.5 * smoothstep((m - 2) / 6);
      or = r * k + (mm - r * k) * white;
      og = g * k + (mm - g * k) * white;
      ob = b * k + (mm - b * k) * white;
    }
    out[i * 4] = Math.floor(linearToSrgb(or) * 255);
    out[i * 4 + 1] = Math.floor(linearToSrgb(og) * 255);
    out[i * 4 + 2] = Math.floor(linearToSrgb(ob) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Display luminance of one HDR colour under `tonemap` (without the whitening of extreme light). */
function displayLuminance(r: number, g: number, b: number, exposure: number): number {
  const m = Math.max(r, g, b) * exposure;
  if (m <= 0) return 0;
  const k = (aces(m) / m) * exposure;
  return 0.299 * linearToSrgb(r * k) + 0.587 * linearToSrgb(g * k) + 0.114 * linearToSrgb(b * k);
}

/**
 * Chiaroscuro (Phase 9 merge): keeps the lights and deepens the mid-tones only as far as needed, so
 * every combination of background and foreground stays a dark space with glowing light — the brightest
 * 1 % at least `ratio` times the median and at least `peak` on screen. A brightness curve only
 * (each pixel's channels scaled together), so hues stay the photo's.
 */
export function chiaroscuro(h: Hdr, exposure: number, ratio = 2.8, peak = 0.72): void {
  const n = h.W * h.H;
  const step = Math.max(1, Math.floor(n / 20000));
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  const mOf = (i: number) => Math.max(h.r[i], h.g[i], h.b[i]);
  const ms = idx.map(mOf).sort((a, b) => a - b);
  const m99 = ms[Math.floor(0.99 * (ms.length - 1))];
  if (!(m99 > 0)) return;
  const quant = (gamma: number, gain: number) => {
    const ys = idx
      .map((i) => {
        const m = mOf(i);
        const k = gain * (m > 0 ? Math.min(1, Math.pow(m / m99, gamma)) : 0);
        return displayLuminance(h.r[i] * k, h.g[i] * k, h.b[i] * k, exposure);
      })
      .sort((a, b) => a - b);
    return [ys[Math.floor(0.5 * (ys.length - 1))], ys[Math.floor(0.99 * (ys.length - 1))]];
  };
  let gamma = 0;
  let gain = 1;
  for (let g = 0; g <= 1.6 + 1e-9; g += 0.1) {
    gamma = g;
    // Raise the whole frame until its lights reach `peak` (bounded), then check the contrast.
    gain = 1;
    for (let it = 0; it < 12 && quant(gamma, gain)[1] < peak; it++) gain *= 1.15;
    const [q50, q99] = quant(gamma, gain);
    if (q99 >= ratio * q50) break;
  }
  if (gamma === 0 && gain === 1) return;
  for (let i = 0; i < n; i++) {
    const m = mOf(i);
    if (m <= 0) continue;
    const k = gain * Math.min(1, Math.pow(m / m99, gamma));
    h.r[i] *= k;
    h.g[i] *= k;
    h.b[i] *= k;
  }
}
