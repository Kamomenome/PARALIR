import type { Rgb3 } from '../../shared/color';
import { grow, rng } from '../../shared/inplace';

/** The hole the subject leaves (the region taken away, grown a little), as cleanPlate takes it away. */
export function holeOf(region: Float32Array, W: number, H: number, cut: number): Float32Array {
  return grow(region.map((v) => (v > cut ? 1 : 0)), W, H, Math.max(1, Math.round(0.015 * H)));
}

/** Share of the box's pixels set in `m`. */
function share(m: Float32Array, W: number, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += m[y * W + x] > 0.5 ? 1 : 0;
  return n / Math.max(1, (x1 - x0) * (y1 - y0));
}

/** A shuffle from the seed (Fisher–Yates): the same order in every browser. */
function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The hole filled with rectangles of the surrounding photo (015 FR-1504, the user's choice 「全部 B」): a grid of
 * rectangles of mixed sizes over the hole, each a piece of the photo cut from the nearest place clear of the hole,
 * with the thin cut line the moved rectangles have. Where no piece fits, the smooth plate stays. `covered` marks
 * the pixels a piece was pasted on.
 */
export function fillHole(photo: Rgb3, hole: Float32Array, plate: Rgb3, seed: number, W: number, H: number): { out: Rgb3; covered: Uint8Array } {
  const out: Rgb3 = { r: Float32Array.from(plate.r), g: Float32Array.from(plate.g), b: Float32Array.from(plate.b) };
  const covered = new Uint8Array(W * H);
  const rand = rng(seed ^ 0x2f6b1c3d);
  const cells: [number, number, number, number][] = [];
  for (let y = 0; y < H; ) {
    const h = Math.max(2, Math.round(H * (0.04 + 0.07 * rand())));
    for (let x = 0; x < W; ) {
      const w = Math.max(2, Math.round(W * (0.04 + 0.07 * rand())));
      if (share(hole, W, x, y, Math.min(W, x + w), Math.min(H, y + h)) > 0.02) cells.push([x, y, w, h]);
      x += w;
    }
    y += h;
  }
  for (const [x0, y0, w, h] of shuffle(cells, rand)) {
    search: for (let ring = 1; ring <= 12; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = rand() * 2 * Math.PI;
        const sx = Math.round(x0 + Math.cos(a) * ring * w * 0.8);
        const sy = Math.round(y0 + Math.sin(a) * ring * h * 0.8);
        if (sx < 0 || sy < 0 || sx + w > W || sy + h > H || share(hole, W, sx, sy, sx + w, sy + h) > 0.05) continue;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const tx = x0 + x;
            const ty = y0 + y;
            if (tx >= W || ty >= H) continue;
            const i = ty * W + tx;
            const j = (sy + y) * W + (sx + x);
            const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 0.75 : 1;
            out.r[i] = photo.r[j] * edge;
            out.g[i] = photo.g[j] * edge;
            out.b[i] = photo.b[j] * edge;
            covered[i] = 1;
          }
        }
        break search;
      }
    }
  }
  return { out, covered };
}
