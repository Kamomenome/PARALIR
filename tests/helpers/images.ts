import type { RgbImage } from '../../src/engine/common/image/normalize';

/** Deterministic photo-like test image: gradient sky, blocks ("buildings"), stripes ("road"). */
export function makeScene(width: number, height: number, variant = 0): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const ny = y / height;
      const nx = x / width;
      let r = 90 + 120 * (1 - ny);
      let g = 140 + 80 * (1 - ny);
      let b = 200 + 40 * (1 - ny);
      const block = Math.floor(nx * 6 + variant) % 3;
      if (ny > 0.35 && ny < 0.75 && (Math.floor(nx * 12) % 2 === 0 || block === 1)) {
        r = 60 + 50 * block;
        g = 50 + 30 * ((x >> 2) % 3);
        b = 40 + 70 * ((y >> 3) % 2);
      }
      if (ny >= 0.75) {
        const stripe = Math.floor((nx + ny * 0.5) * 16) % 2;
        r = g = b = stripe ? 200 : 45;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return { width, height, data };
}

export function solid(width: number, height: number, rgb: [number, number, number]): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let p = 0; p < width * height; p++) data.set(rgb, p * 3);
  return { width, height, data };
}

/** Same pixels in a different arrangement (identical histogram). */
export function shufflePixels(img: RgbImage, seed = 1): RgbImage {
  const n = img.width * img.height;
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const data = new Uint8Array(img.data.length);
  order.forEach((from, to) => data.set(img.data.subarray(from * 3, from * 3 + 3), to * 3));
  return { width: img.width, height: img.height, data };
}
