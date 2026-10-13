import type { RgbImage } from '../../../common/image/normalize';
import { clip, smoothstep } from '../../../common/math';
import { blurChannel, linearToSrgb, newRgb, type Rgb3 } from './color';
import type { PhotoObject } from './object';
import { mipSampler } from './photo';

/**
 * The photo kept in place (003 FR-317, FR-318): the photo fills the frame (cover), only its subject is rebuilt.
 * Helpers shared by the worlds that work on the photo where it is.
 */

/** Where frame pixel (x, y) falls in the photo: u = u0 + x * du, v = v0 + y * dv; footprint in photo pixels. */
export function frameOf(img: RgbImage, W: number, H: number): { u0: number; v0: number; du: number; dv: number; foot: number } {
  const aspect = img.width / img.height;
  // Frame pixels per photo height: the photo covers the frame.
  const s = Math.max(H, W / aspect);
  return { u0: 0.5 - W / (2 * s * aspect), v0: 0.5 - H / (2 * s), du: 1 / (s * aspect), dv: 1 / s, foot: img.height / s };
}

/** The photo as it fills the frame (linear colour). */
export function framePhoto(img: RgbImage, W: number, H: number): Rgb3 {
  const f = frameOf(img, W, H);
  const sample = mipSampler(img);
  const out = newRgb(W * H);
  const c = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      sample(f.u0 + (x + 0.5) * f.du, f.v0 + (y + 0.5) * f.dv, f.foot, c);
      const i = y * W + x;
      out.r[i] = c[0];
      out.g[i] = c[1];
      out.b[i] = c[2];
    }
  }
  return out;
}

/** The object's mask at photo (u, v) (bilinear in its crop; 0 outside the crop). */
export function maskAt(obj: Pick<PhotoObject, 'crop' | 'mask'>, aspect: number, u: number, v: number): number {
  const [cu, cv, half] = obj.crop;
  const m = obj.mask;
  const mx = (((u - cu) * aspect) / (2 * half) + 0.5) * m.w - 0.5;
  const my = ((v - cv) / (2 * half) + 0.5) * m.h - 0.5;
  if (mx < -0.5 || my < -0.5 || mx > m.w - 0.5 || my > m.h - 0.5) return 0;
  const x0 = clip(Math.floor(mx), 0, m.w - 1);
  const y0 = clip(Math.floor(my), 0, m.h - 1);
  const x1 = Math.min(m.w - 1, x0 + 1);
  const y1 = Math.min(m.h - 1, y0 + 1);
  const fx = clip(mx - x0, 0, 1);
  const fy = clip(my - y0, 0, 1);
  const a = m.a;
  return (a[y0 * m.w + x0] * (1 - fx) + a[y0 * m.w + x1] * fx) * (1 - fy) + (a[y1 * m.w + x0] * (1 - fx) + a[y1 * m.w + x1] * fx) * fy;
}

/**
 * The subject's region in the frame (0..1). The estimate without AI is patchy, so its mask is closed (holes
 * and gaps filled, the outline smoothed); the AI's outline is used as it is.
 */
export function regionMask(obj: PhotoObject, img: RgbImage, W: number, H: number): Float32Array {
  const f = frameOf(img, W, H);
  const aspect = img.width / img.height;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = maskAt(obj, aspect, f.u0 + (x + 0.5) * f.du, f.v0 + (y + 0.5) * f.dv);
  if (obj.source !== 'estimate') return out;
  const b = Float32Array.from(out);
  blurChannel(b, W, H, Math.max(1, Math.round(0.035 * H)));
  for (let i = 0; i < W * H; i++) out[i] = Math.max(out[i], smoothstep((b[i] - 0.12) / 0.2));
  return out;
}

/** A mask grown by r pixels (square max filter, separable). */
export function grow(m: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) v = Math.max(v, m[y * W + k]);
      tmp[y * W + x] = v;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) v = Math.max(v, tmp[k * W + x]);
      out[y * W + x] = v;
    }
  }
  return out;
}

/** The region's box in frame pixels (where the region exceeds `t`); null if empty. */
export function regionBox(region: Float32Array, W: number, H: number, t = 0.3): [number, number, number, number] | null {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (region[y * W + x] <= t) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/**
 * The photo with the subject taken away: the region (grown a little) is filled from the photo around it
 * (push-pull: averaged down to where there is photo, then brought back up smoothly), like a studio wall.
 */
export function cleanPlate(photo: Rgb3, region: Float32Array, W: number, H: number, cut = 0.25): Rgb3 {
  // `cut`: how much of the region is taken away. The AI's masks are never quite 0 around the subject (0.25);
  // the estimate's closed mask is (0.05, as in the rectangles the user liked).
  const hole = grow(region.map((v) => (v > cut ? 1 : 0)), W, H, Math.max(1, Math.round(0.015 * H)));
  // A subject over the whole frame leaves no photo to fill from: then a soft blur of the photo stands in.
  if (hole.every((v) => v > 0)) {
    const soft = { r: Float32Array.from(photo.r), g: Float32Array.from(photo.g), b: Float32Array.from(photo.b) };
    for (const ch of [soft.r, soft.g, soft.b]) blurChannel(ch, W, H, Math.max(1, Math.round(0.12 * H)));
    return soft;
  }
  type Level = { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array; a: Float32Array };
  const base: Level = { w: W, h: H, r: Float32Array.from(photo.r), g: Float32Array.from(photo.g), b: Float32Array.from(photo.b), a: hole.map((v) => 1 - v) };
  const levels: Level[] = [base];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const p = levels[levels.length - 1];
    const w = Math.max(1, Math.ceil(p.w / 2));
    const h = Math.max(1, Math.ceil(p.h / 2));
    const q: Level = { w, h, r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h), a: new Float32Array(w * h) };
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        const j = (y >> 1) * w + (x >> 1);
        const a = p.a[i];
        q.r[j] += p.r[i] * a;
        q.g[j] += p.g[i] * a;
        q.b[j] += p.b[i] * a;
        q.a[j] += a;
      }
    }
    for (let j = 0; j < w * h; j++) {
      if (q.a[j] > 0) {
        q.r[j] /= q.a[j];
        q.g[j] /= q.a[j];
        q.b[j] /= q.a[j];
      }
      q.a[j] = Math.min(1, q.a[j]);
    }
    levels.push(q);
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const p = levels[l];
    const q = levels[l + 1];
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        // Bilinear from the coarser level, then mixed by how much photo this pixel has.
        const fx = clip((x + 0.5) / 2 - 0.5, 0, q.w - 1);
        const fy = clip((y + 0.5) / 2 - 0.5, 0, q.h - 1);
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(q.w - 1, x0 + 1);
        const y1 = Math.min(q.h - 1, y0 + 1);
        const tx = fx - x0;
        const ty = fy - y0;
        const at = (ch: Float32Array) => (ch[y0 * q.w + x0] * (1 - tx) + ch[y0 * q.w + x1] * tx) * (1 - ty) + (ch[y1 * q.w + x0] * (1 - tx) + ch[y1 * q.w + x1] * tx) * ty;
        const a = p.a[i];
        p.r[i] = p.r[i] * a + at(q.r) * (1 - a);
        p.g[i] = p.g[i] * a + at(q.g) * (1 - a);
        p.b[i] = p.b[i] * a + at(q.b) * (1 - a);
        p.a[i] = 1;
      }
    }
  }
  return { r: base.r, g: base.g, b: base.b };
}

/** Linear colour to display bytes (no tone curve: the photo stays as it is). */
export function toRgba(c: Rgb3, W: number, H: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[4 * i] = Math.round(255 * linearToSrgb(c.r[i]));
    out[4 * i + 1] = Math.round(255 * linearToSrgb(c.g[i]));
    out[4 * i + 2] = Math.round(255 * linearToSrgb(c.b[i]));
    out[4 * i + 3] = 255;
  }
  return out;
}

/** A small seeded generator for layouts (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
