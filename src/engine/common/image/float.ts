import type { FloatRgb } from '../math';
import type { RgbImage } from './normalize';

const unitCache = new WeakMap<RgbImage, FloatRgb>();

/** The photo as float32 values in [0,1] (cached per image). */
export function toUnitFloat(img: RgbImage): FloatRgb {
  let f = unitCache.get(img);
  if (!f) {
    const data = new Float32Array(img.data.length);
    for (let i = 0; i < data.length; i++) data[i] = img.data[i] / 255;
    f = { width: img.width, height: img.height, data };
    unitCache.set(img, f);
  }
  return f;
}
