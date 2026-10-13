/** Floor-based modulo, so negative inputs land in [0, m) (REFERENCE_METHOD §4.3). */
export function positiveMod(t: number, m: number): number {
  return t - m * Math.floor(t / m);
}

/** Triangle wave with range [0, 1] and period 2. */
export function mirror(t: number): number {
  return 1 - Math.abs(positiveMod(t, 2) - 1);
}

export function clip(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

/** f(t) = t²(3-2t) with t clamped to [0, 1]. */
export function smoothstep(t: number): number {
  const u = clip(t, 0, 1);
  return u * u * (3 - 2 * u);
}

/** Half-sample symmetric index reflection (scipy.ndimage mode='reflect'). */
export function reflectIndex(i: number, n: number): number {
  if (n === 1) return 0;
  const p = 2 * n;
  const k = ((i % p) + p) % p;
  return k < n ? k : p - 1 - k;
}

export interface FloatRgb {
  width: number;
  height: number;
  /** Row-major RGB, any numeric scale. */
  data: ArrayLike<number>;
}

/** Bilinear sample at continuous pixel coordinates (sx, sy); edges reflect. Writes RGB into out. */
export function bilinearReflect(img: FloatRgb, sx: number, sy: number, out: number[] | Float64Array): void {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const dx = sx - x0;
  const dy = sy - y0;
  const w = img.width;
  const h = img.height;
  const xa = reflectIndex(x0, w);
  const xb = reflectIndex(x0 + 1, w);
  const ya = reflectIndex(y0, h);
  const yb = reflectIndex(y0 + 1, h);
  const w00 = (1 - dx) * (1 - dy);
  const w10 = dx * (1 - dy);
  const w01 = (1 - dx) * dy;
  const w11 = dx * dy;
  const d = img.data;
  const i00 = (ya * w + xa) * 3;
  const i10 = (ya * w + xb) * 3;
  const i01 = (yb * w + xa) * 3;
  const i11 = (yb * w + xb) * 3;
  for (let c = 0; c < 3; c++) {
    out[c] = w00 * d[i00 + c] + w10 * d[i10 + c] + w01 * d[i01 + c] + w11 * d[i11 + c];
  }
}
