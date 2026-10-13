import { downsampleArea } from '../../common/analysis/downsample';
import type { RgbImage } from '../../common/image/normalize';
import { bilinearReflect, mirror, smoothstep } from '../../common/math';
import { toUnitFloat } from '../../common/image/float';
import { blurChannel, srgbToLinear } from './hdr';

/**
 * Photo-only materials (Phase 5): every colour drawn by the spatial mode comes from photo pixels,
 * possibly warped, blurred or colour-transformed — never from synthetic shapes or gradients.
 */

export type Rgb = [number, number, number] | number[];

/** Linear colour of the photo at normalised (u, v); coordinates outside [0,1] reflect back in. */
export function photoSampler(img: RgbImage): (u: number, v: number, out: Rgb) => void {
  const f = toUnitFloat(img);
  const w1 = img.width - 1;
  const h1 = img.height - 1;
  return (u, v, out) => {
    bilinearReflect(f, mirror(u) * w1, mirror(v) * h1, out as number[]);
    out[0] = srgbToLinear(out[0]);
    out[1] = srgbToLinear(out[1]);
    out[2] = srgbToLinear(out[2]);
  };
}

/** A small linear image in [0,1]³ with bilinear sampling at normalised coordinates. */
export interface SmallImage {
  w: number;
  h: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

export function sampleSmall(m: SmallImage, u: number, v: number, out: Rgb): void {
  const x = mirror(u) * (m.w - 1);
  const y = mirror(v) * (m.h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(m.w - 1, x0 + 1);
  const y1 = Math.min(m.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (ch: Float32Array) =>
    (ch[y0 * m.w + x0] * (1 - fx) + ch[y0 * m.w + x1] * fx) * (1 - fy) + (ch[y1 * m.w + x0] * (1 - fx) + ch[y1 * m.w + x1] * fx) * fy;
  out[0] = at(m.r);
  out[1] = at(m.g);
  out[2] = at(m.b);
}

/** The photo downsampled (area average, long side ≤ 256) in linear light. */
export function linearSmall(img: RgbImage): SmallImage {
  const d = downsampleArea(img);
  const n = d.width * d.height;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    r[p] = srgbToLinear(d.data[p * 3]);
    g[p] = srgbToLinear(d.data[p * 3 + 1]);
    b[p] = srgbToLinear(d.data[p * 3 + 2]);
  }
  return { w: d.width, h: d.height, r, g, b };
}

/**
 * "Light of the photo": its bright parts (lit windows, signs, sky) kept and everything else dimmed,
 * then blurred heavily, normalised so the brightest light is 1. A black photo gives a black map.
 */
export function lightMap(img: RgbImage): SmallImage {
  const s = linearSmall(img);
  const n = s.w * s.h;
  const out: SmallImage = { w: s.w, h: s.h, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
  for (let p = 0; p < n; p++) {
    const l = 0.2126 * s.r[p] + 0.7152 * s.g[p] + 0.0722 * s.b[p];
    const k = 0.15 + 0.85 * smoothstep((l - 0.05) / 0.5);
    out.r[p] = s.r[p] * k;
    out.g[p] = s.g[p] * k;
    out.b[p] = s.b[p] * k;
  }
  const radius = Math.max(1, Math.round(Math.max(s.w, s.h) * 0.04));
  for (const ch of [out.r, out.g, out.b]) blurChannel(ch, s.w, s.h, radius);
  let mx = 0;
  for (let p = 0; p < n; p++) mx = Math.max(mx, 0.2126 * out.r[p] + 0.7152 * out.g[p] + 0.0722 * out.b[p]);
  if (mx > 1e-6) {
    for (const ch of [out.r, out.g, out.b]) for (let p = 0; p < n; p++) ch[p] /= mx;
  }
  return out;
}
