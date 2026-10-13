import type { RgbImage } from '../../../common/image/normalize';
import { bilinearReflect, clip, smoothstep } from '../../../common/math';
import { NEAR, project, type Camera } from './camera';
import { srgbToLinear } from './color';
import type { Vec3 } from '../types';

/**
 * Flat photo plates in perspective: a square crop of the photo, cut out by a soft mask (or with an
 * irregular edge), placed and turned in camera space. Rigid: a plate is never bent, so its straight
 * lines stay straight. Drawn far to near (painter's order).
 */

/** A soft mask (0..1) over a plate's square crop. */
export interface Mask {
  w: number;
  h: number;
  a: Float32Array;
}

export interface Plate {
  /** Square crop in normalised photo coordinates: centre u, v and half-size in photo heights. */
  crop: [number, number, number];
  centre: Vec3;
  /** Half-size in world units. */
  size: number;
  right: Vec3;
  up: Vec3;
  /** The object's outline; null = the crop with an irregular edge (phases of the edge noise in `edge`). */
  mask: Mask | null;
  edge: [number, number, number];
  /** Opacity of the whole plate (1 when absent). */
  alpha?: number;
}

/** Linear colour, coverage and depth of drawn plates. */
export interface Layer {
  W: number;
  H: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Float32Array;
  depth: Float32Array;
}

export function newLayer(W: number, H: number): Layer {
  const n = W * H;
  return { W, H, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), a: new Float32Array(n), depth: new Float32Array(n).fill(Infinity) };
}

/** Corners in screen space (or null when behind the camera). */
export function screenQuad(p: Plate, cam: Camera, W: number, H: number) {
  const s = p.size;
  const corners: Vec3[] = [
    [p.centre[0] - p.right[0] * s - p.up[0] * s, p.centre[1] - p.right[1] * s - p.up[1] * s, p.centre[2] - p.right[2] * s - p.up[2] * s],
    [p.centre[0] + p.right[0] * s - p.up[0] * s, p.centre[1] + p.right[1] * s - p.up[1] * s, p.centre[2] + p.right[2] * s - p.up[2] * s],
    [p.centre[0] + p.right[0] * s + p.up[0] * s, p.centre[1] + p.right[1] * s + p.up[1] * s, p.centre[2] + p.right[2] * s + p.up[2] * s],
    [p.centre[0] - p.right[0] * s + p.up[0] * s, p.centre[1] - p.right[1] * s + p.up[1] * s, p.centre[2] - p.right[2] * s + p.up[2] * s],
  ];
  if (corners.some((c) => c[2] < NEAR * 4)) return null;
  return corners.map((c) => project(cam, c[0], c[1], c[2], W, H));
}

/** Longest side of a plate on screen (pixels); 0 when behind the camera. */
export function projectedSize(p: Plate, cam: Camera, W: number, H: number): number {
  const q = screenQuad(p, cam, W, H);
  if (!q) return 0;
  const xs = q.map((c) => c.sx);
  const ys = q.map((c) => c.sy);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** Homography from the unit square to the quad, inverted (maps screen → plate uv). */
function inverseHomography(q: { sx: number; sy: number }[]): number[] | null {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.sx - p2.sx;
  const dx2 = p3.sx - p2.sx;
  const dy1 = p1.sy - p2.sy;
  const dy2 = p3.sy - p2.sy;
  const sx = p0.sx - p1.sx + p2.sx - p3.sx;
  const sy = p0.sy - p1.sy + p2.sy - p3.sy;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) return null;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  const a = p1.sx - p0.sx + g * p1.sx;
  const b = p3.sx - p0.sx + h * p3.sx;
  const c = p0.sx;
  const d = p1.sy - p0.sy + g * p1.sy;
  const e = p3.sy - p0.sy + h * p3.sy;
  const f = p0.sy;
  const A = e - f * h;
  const B = c * h - b;
  const C = b * f - c * e;
  const D = f * g - d;
  const E = a - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const Hh = b * g - a * h;
  const I = a * e - b * d;
  if (Math.abs(I) < 1e-12) return null;
  return [A, B, C, D, E, F, G, Hh, I];
}

function maskAt(m: Mask, u: number, v: number): number {
  const mx = clip(u * m.w - 0.5, 0, m.w - 1);
  const my = clip(v * m.h - 0.5, 0, m.h - 1);
  const x0 = Math.floor(mx);
  const y0 = Math.floor(my);
  const x1 = Math.min(m.w - 1, x0 + 1);
  const y1 = Math.min(m.h - 1, y0 + 1);
  const fx = mx - x0;
  const fy = my - y0;
  return (m.a[y0 * m.w + x0] * (1 - fx) + m.a[y0 * m.w + x1] * fx) * (1 - fy) + (m.a[y1 * m.w + x0] * (1 - fx) + m.a[y1 * m.w + x1] * fx) * fy;
}

/** Draws the plates far to near; each pixel samples the photo through the inverse homography. */
export function renderPlates(plates: Plate[], img: RgbImage, cam: Camera, layer: Layer): void {
  const { W, H } = layer;
  const order = plates.map((pl, idx) => ({ pl, idx })).sort((a, b) => b.pl.centre[2] - a.pl.centre[2] || a.idx - b.idx);
  const col = [0, 0, 0];
  const aspect = img.width / img.height;
  for (const { pl } of order) {
    const q = screenQuad(pl, cam, W, H);
    if (!q) continue;
    const inv = inverseHomography(q);
    if (!inv) continue;
    const alphaK = pl.alpha ?? 1;
    if (alphaK <= 0) continue;
    const minX = Math.max(0, Math.floor(Math.min(...q.map((c) => c.sx))));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(...q.map((c) => c.sx))));
    const minY = Math.max(0, Math.floor(Math.min(...q.map((c) => c.sy))));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(...q.map((c) => c.sy))));
    const [cu, cv, half] = pl.crop;
    const [A, B, C, D, E, F, G, Hh, I] = inv;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w = G * px + Hh * py + I;
        const u = (A * px + B * py + C) / w;
        const v = (D * px + E * py + F) / w;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        let a: number;
        if (pl.mask) a = maskAt(pl.mask, u, v);
        else {
          const edgeDist = Math.min(u, 1 - u, v, 1 - v);
          const noise = 0.06 * (Math.sin(u * 13 + pl.edge[0]) * Math.sin(v * 11 + pl.edge[1]) + 0.5 * Math.sin((u + v) * 27 + pl.edge[2]));
          a = smoothstep((edgeDist - 0.02 - noise) / 0.07);
        }
        a *= alphaK;
        if (a <= 0) continue;
        const su = cu + ((u - 0.5) * 2 * half) / aspect;
        const sv = cv + (v - 0.5) * 2 * half;
        bilinearReflect(img, su * (img.width - 1), sv * (img.height - 1), col);
        const i = y * W + x;
        layer.r[i] = layer.r[i] * (1 - a) + srgbToLinear(col[0] / 255) * a;
        layer.g[i] = layer.g[i] * (1 - a) + srgbToLinear(col[1] / 255) * a;
        layer.b[i] = layer.b[i] * (1 - a) + srgbToLinear(col[2] / 255) * a;
        layer.a[i] = layer.a[i] * (1 - a) + a;
        if (a > 0.5) layer.depth[i] = pl.centre[2];
      }
    }
  }
}
