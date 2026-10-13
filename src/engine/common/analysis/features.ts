import type { RgbImage } from '../image/normalize';
import { clip } from '../math';
import { downsampleArea } from './downsample';

export interface FeatureMaps {
  Y: Float32Array;
  S: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
  G: Float32Array;
}

/** analysis-v1 (docs/REPRODUCIBILITY.md §5; E = mean(G) per data-model.md). */
export interface ImageFeatures {
  sourceWidth: number;
  sourceHeight: number;
  analysisWidth: number;
  analysisHeight: number;
  L: number;
  K: number;
  S: number;
  H: number;
  E: number;
  D: number;
  P: number;
  hueHistogram: number[];
  maps: FeatureMaps;
}

/** Standard max/min HSV; Δ=0 → hue 0, S 0; max=0 → S 0; ties resolved R→G→B. Hue in [0,1). */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  if (d === 0) return [0, max === 0 ? 0 : s, max];
  let h: number;
  if (max === r) h = (((g - b) / d) % 6 + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, max];
}

export function analyze(img: RgbImage): ImageFeatures {
  const a = downsampleArea(img);
  const w = a.width;
  const h = a.height;
  const n = w * h;
  const Y = new Float32Array(n);
  const S = new Float32Array(n);
  const hueHistogram = new Array<number>(36).fill(0);
  const yBins = new Array<number>(64).fill(0);
  let sumY = 0;
  let sumS = 0;
  let hx = 0;
  let hy = 0;
  const yd = new Float64Array(n);
  for (let p = 0; p < n; p++) {
    const r = a.data[p * 3];
    const g = a.data[p * 3 + 1];
    const b = a.data[p * 3 + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const [hue, s] = rgbToHsv(r, g, b);
    yd[p] = y;
    Y[p] = y;
    S[p] = s;
    sumY += y;
    sumS += s;
    hueHistogram[Math.min(35, Math.floor(hue * 36))] += s;
    yBins[Math.min(63, Math.max(0, Math.floor(y * 64)))]++;
    hx += s * Math.cos(2 * Math.PI * hue);
    hy += s * Math.sin(2 * Math.PI * hue);
  }
  const L = sumY / n;
  let varY = 0;
  for (let p = 0; p < n; p++) varY += (yd[p] - L) ** 2;
  const K = clip(2 * Math.sqrt(varY / n), 0, 1);
  let ent = 0;
  for (const c of yBins) {
    if (c === 0) continue;
    const pr = c / n;
    ent -= pr * Math.log2(pr);
  }
  hx /= n;
  hy /= n;
  const D = Math.sqrt(hx * hx + hy * hy);
  const P = D < 1e-6 ? 0 : Math.atan2(hy, hx);

  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const G = new Float32Array(n);
  let sumG = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const dx = (yd[y * w + Math.min(w - 1, x + 1)] - yd[y * w + Math.max(0, x - 1)]) / 2;
      const dy = (yd[Math.min(h - 1, y + 1) * w + x] - yd[Math.max(0, y - 1) * w + x]) / 2;
      gx[p] = dx;
      gy[p] = dy;
      G[p] = clip(4 * Math.sqrt(dx * dx + dy * dy), 0, 1);
      sumG += G[p];
    }
  }
  return {
    sourceWidth: img.width,
    sourceHeight: img.height,
    analysisWidth: w,
    analysisHeight: h,
    L,
    K,
    S: sumS / n,
    H: ent / 6,
    E: sumG / n,
    D,
    P,
    hueHistogram: hueHistogram.map((v) => v / n),
    maps: { Y, S, gx, gy, G },
  };
}

/** Neutral stand-ins used when the feature influence is 0 (research R-10). */
export function neutralFeatures(f: ImageFeatures): ImageFeatures {
  const n = f.analysisWidth * f.analysisHeight;
  return {
    ...f,
    L: 0.5,
    K: 0.5,
    S: 0.5,
    H: 0.5,
    E: 0.5,
    D: 0,
    P: 0,
    hueHistogram: new Array(36).fill(0),
    maps: {
      Y: new Float32Array(n).fill(0.5),
      S: new Float32Array(n).fill(0.5),
      gx: new Float32Array(n),
      gy: new Float32Array(n),
      G: new Float32Array(n),
    },
  };
}

/** Bilinear lookup of a feature map at normalised coordinates (u, v) ∈ [0,1]², clamped. */
export function sampleMap(map: Float32Array, w: number, h: number, u: number, v: number): number {
  const x = clip(u, 0, 1) * (w - 1);
  const y = clip(v, 0, 1) * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const dx = x - x0;
  const dy = y - y0;
  return (
    (1 - dx) * (1 - dy) * map[y0 * w + x0] +
    dx * (1 - dy) * map[y0 * w + x1] +
    (1 - dx) * dy * map[y1 * w + x0] +
    dx * dy * map[y1 * w + x1]
  );
}
