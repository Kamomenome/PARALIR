import { boxWeights } from '../analysis/downsample';
/** Upright, white-composited 8-bit RGB image, row-major. */
export interface RgbImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface CropPx {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Provisional limits (docs/REPRODUCIBILITY.md §7). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Working size: larger photos are reduced to this many pixels after decoding (FR-223). */
export const MAX_PIXELS = 12_000_000;
/** Largest photo accepted for decoding (memory); above this the photo is refused. */
export const MAX_DECODE_PIXELS = 50_000_000;
/** Longest side a browser canvas takes; a longer image fails deep inside the decoder (008 FR-813). */
export const MAX_SIDE = 32767;

export function compositeWhite(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): { image: RgbImage; hadTransparency: boolean } {
  const n = width * height;
  const data = new Uint8Array(n * 3);
  let hadTransparency = false;
  for (let p = 0; p < n; p++) {
    const a = rgba[p * 4 + 3];
    if (a === 255) {
      data[p * 3] = rgba[p * 4];
      data[p * 3 + 1] = rgba[p * 4 + 1];
      data[p * 3 + 2] = rgba[p * 4 + 2];
      continue;
    }
    hadTransparency = true;
    const k = a / 255;
    for (let c = 0; c < 3; c++) {
      data[p * 3 + c] = Math.round(rgba[p * 4 + c] * k + 255 * (1 - k));
    }
  }
  return { image: { width, height, data }, hadTransparency };
}

export function crop(img: RgbImage, px: CropPx): RgbImage {
  const width = img.width - px.left - px.right;
  const height = img.height - px.top - px.bottom;
  if (width < 1 || height < 1) throw new RangeError('crop leaves an empty image');
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const from = ((y + px.top) * img.width + px.left) * 3;
    data.set(img.data.subarray(from, from + width * 3), y * width * 3);
  }
  return { width, height, data };
}

export type SizeCheck =
  | { ok: true }
  | { ok: false; reason: 'file-too-large' | 'too-many-pixels' | 'invalid-dimensions' | 'too-long-side'; message: string };

export function validateSize(fileBytes: number, width: number, height: number): SizeCheck {
  if (fileBytes > MAX_FILE_BYTES) {
    return { ok: false, reason: 'file-too-large', message: 'ファイルが大きすぎます（上限 20 MiB）' };
  }
  if (!(width >= 1 && height >= 1)) {
    return { ok: false, reason: 'invalid-dimensions', message: '画像の寸法を読み取れません' };
  }
  if (width > MAX_SIDE || height > MAX_SIDE) {
    return { ok: false, reason: 'too-long-side', message: `画像の縦か横が長すぎます（上限 ${MAX_SIDE} px）` };
  }
  if (width * height > MAX_DECODE_PIXELS) {
    return { ok: false, reason: 'too-many-pixels', message: '画素数が多すぎます（上限 5000 万画素）' };
  }
  return { ok: true };
}

export interface ImageHeader {
  format: 'png' | 'jpeg';
  width: number;
  height: number;
}

/** Read stored (pre-orientation) dimensions from a PNG or JPEG header without decoding. */
export function readImageDimensions(b: Uint8Array): ImageHeader | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 24 && png.every((v, i) => b[i] === v)) {
    return { format: 'png', width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = dv.getUint16(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return null;
      return { format: 'jpeg', height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    i += 2 + len;
  }
  return null;
}

/**
 * Reduces a photo above MAX_PIXELS to at most MAX_PIXELS with the same aspect (±1 px), by an area
 * average computed here (separable box weights, double precision, rounded) — not by the browser's
 * resampling, which may differ between browsers and would change the pixel hash (FR-223, R-212).
 * Photos within the limit are returned as they are.
 */
export function fitPixels(img: RgbImage, max = MAX_PIXELS): RgbImage {
  const { width: w, height: h } = img;
  if (w * h <= max) return img;
  let W = Math.max(1, Math.floor(w * Math.sqrt(max / (w * h))));
  let H = Math.max(1, Math.round((W * h) / w));
  while (W * H > max && W > 1) {
    W--;
    H = Math.max(1, Math.round((W * h) / w));
  }
  const wx = boxWeights(w, W);
  const wy = boxWeights(h, H);
  const out = new Uint8Array(W * H * 3);
  const row = new Float64Array(w * 3);
  for (let Y = 0; Y < H; Y++) {
    // Vertical pass for this output row (weighted sum of the input rows it covers), then horizontal.
    row.fill(0);
    const { start: sy, weights: ky } = wy[Y];
    for (let j = 0; j < ky.length; j++) {
      const base = (sy + j) * w * 3;
      const k = ky[j];
      for (let i = 0; i < w * 3; i++) row[i] += k * img.data[base + i];
    }
    for (let X = 0; X < W; X++) {
      const { start: sx, weights: kx } = wx[X];
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < kx.length; i++) {
        const p = (sx + i) * 3;
        r += kx[i] * row[p];
        g += kx[i] * row[p + 1];
        b += kx[i] * row[p + 2];
      }
      const o = (Y * W + X) * 3;
      out[o] = Math.min(255, Math.max(0, Math.round(r)));
      out[o + 1] = Math.min(255, Math.max(0, Math.round(g)));
      out[o + 2] = Math.min(255, Math.max(0, Math.round(b)));
    }
  }
  return { width: W, height: H, data: out };
}
