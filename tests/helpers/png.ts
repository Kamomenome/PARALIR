import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { RgbImage } from '../../src/engine/common/image/normalize';

/** Decode a PNG file to RGB8 (alpha dropped; fixtures used here are opaque). */
export function readPngRgb(path: string): RgbImage {
  const png = PNG.sync.read(readFileSync(path));
  const data = new Uint8Array(png.width * png.height * 3);
  for (let p = 0; p < png.width * png.height; p++) {
    data[p * 3] = png.data[p * 4];
    data[p * 3 + 1] = png.data[p * 4 + 1];
    data[p * 3 + 2] = png.data[p * 4 + 2];
  }
  return { width: png.width, height: png.height, data };
}

export function rgbaToRgb(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let p = 0; p < rgba.length / 4; p++) {
    out[p * 3] = rgba[p * 4];
    out[p * 3 + 1] = rgba[p * 4 + 1];
    out[p * 3 + 2] = rgba[p * 4 + 2];
  }
  return out;
}
