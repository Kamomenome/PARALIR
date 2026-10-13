import type { RgbImage } from '../image/normalize';

export const ANALYSIS_LONG_SIDE = 256;

/** Long side 256, short side max(1, floor(256*short/long + 0.5)); small inputs are not upscaled. */
export function analysisSize(w: number, h: number): [number, number] {
  const long = Math.max(w, h);
  if (long <= ANALYSIS_LONG_SIDE) return [w, h];
  const short = Math.max(1, Math.floor((ANALYSIS_LONG_SIDE * Math.min(w, h)) / long + 0.5));
  return w >= h ? [ANALYSIS_LONG_SIDE, short] : [short, ANALYSIS_LONG_SIDE];
}

export interface FloatImage {
  width: number;
  height: number;
  /** RGB in [0, 1]. */
  data: Float64Array;
}

/** 1-D box-filter weights mapping n source samples onto m bins (exact fractional coverage). */
export function boxWeights(n: number, m: number): { start: number; weights: number[] }[] {
  const scale = n / m;
  const out = [];
  for (let k = 0; k < m; k++) {
    const a = k * scale;
    const b = (k + 1) * scale;
    const start = Math.floor(a);
    const weights = [];
    for (let i = start; i < Math.min(n, Math.ceil(b)); i++) {
      weights.push((Math.min(b, i + 1) - Math.max(a, i)) / scale);
    }
    out.push({ start, weights });
  }
  return out;
}

/** Area-average downsample to the analysis size (separable, double precision). */
export function downsampleArea(img: RgbImage): FloatImage {
  const [W, H] = analysisSize(img.width, img.height);
  const wx = boxWeights(img.width, W);
  const wy = boxWeights(img.height, H);
  const tmp = new Float64Array(W * img.height * 3);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < W; x++) {
      const { start, weights } = wx[x];
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = 0; k < weights.length; k++) s += weights[k] * img.data[(y * img.width + start + k) * 3 + c];
        tmp[(y * W + x) * 3 + c] = s / 255;
      }
    }
  }
  const data = new Float64Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const { start, weights } = wy[y];
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = 0; k < weights.length; k++) s += weights[k] * tmp[((start + k) * W + x) * 3 + c];
        data[(y * W + x) * 3 + c] = s;
      }
    }
  }
  return { width: W, height: H, data };
}
