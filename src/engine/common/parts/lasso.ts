import { clip } from '../math';
import { chooseCircled } from './choice';
import { PART, type PhotoParts } from './types';

/**
 * A rough lasso drawn over the preview (005 FR-504): the aim, not the outline. The AI's candidates decide the
 * outline; the lasso itself is used only when nothing the AI found fits it. Points are normalised photo
 * coordinates (u, v), a closed polygon.
 */
export type Lasso = [number, number][];

export const LASSO_MAX_POINTS = 256;

/** The range the rectangles and the theme are drawn over (a mask on a grid covering the whole photo). */
export interface ThemeRange {
  w: number;
  h: number;
  /** 0..255. */
  mask: Uint8Array;
  source: 'lasso+ai' | 'lasso';
}

/** The inside of the polygon (even-odd) at the pixel centres of a w × h grid over the photo: 255 inside. */
export function lassoMask(lasso: Lasso, w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  const n = lasso.length;
  if (n < 3) return m;
  const xs: number[] = [];
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    xs.length = 0;
    for (let k = 0; k < n; k++) {
      const [u0, v0] = lasso[k];
      const [u1, v1] = lasso[(k + 1) % n];
      if (v0 <= v === v1 <= v) continue;
      xs.push(u0 + ((v - v0) / (v1 - v0)) * (u1 - u0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] * w - 0.5));
      const x1 = Math.min(w - 1, Math.floor(xs[k + 1] * w - 0.5));
      for (let x = x0; x <= x1; x++) m[y * w + x] = 255;
    }
  }
  return m;
}

/**
 * Where the AI cuts things out inside the lasso: the inside pixel nearest the lasso's centre of area, then the
 * centres of the four quarters of its box that lie inside.
 */
export function lassoHints(lasso: Lasso): [number, number][] {
  const G = 64;
  const m = lassoMask(lasso, G, G);
  let su = 0;
  let sv = 0;
  let n = 0;
  for (let i = 0; i < G * G; i++) {
    if (!m[i]) continue;
    su += ((i % G) + 0.5) / G;
    sv += (Math.floor(i / G) + 0.5) / G;
    n++;
  }
  if (!n) return [];
  const cu = su / n;
  const cv = sv / n;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < G * G; i++) {
    if (!m[i]) continue;
    const d = (((i % G) + 0.5) / G - cu) ** 2 + ((Math.floor(i / G) + 0.5) / G - cv) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const hints: [number, number][] = [[((best % G) + 0.5) / G, (Math.floor(best / G) + 0.5) / G]];
  let u0 = 1;
  let v0 = 1;
  let u1 = 0;
  let v1 = 0;
  for (const [u, v] of lasso) {
    u0 = Math.min(u0, u);
    v0 = Math.min(v0, v);
    u1 = Math.max(u1, u);
    v1 = Math.max(v1, v);
  }
  for (const [qu, qv] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    const u = u0 + qu * (u1 - u0);
    const v = v0 + qv * (v1 - v0);
    if (m[clip(Math.floor(v * G), 0, G - 1) * G + clip(Math.floor(u * G), 0, G - 1)]) hints.push([u, v]);
  }
  return hints;
}

/** A drag's points, kept in the photo and thinned evenly to at most LASSO_MAX_POINTS. */
export function simplifyLasso(points: Lasso): Lasso {
  const inPhoto = points.map(([u, v]) => [clip(u, 0, 1), clip(v, 0, 1)] as [number, number]);
  if (inPhoto.length <= LASSO_MAX_POINTS) return inPhoto;
  const step = inPhoto.length / LASSO_MAX_POINTS;
  return Array.from({ length: LASSO_MAX_POINTS }, (_, k) => inPhoto[Math.floor(k * step)]);
}

/** The mask grown by r cells (a square reach), for the margin around a lasso. */
function grown(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const across = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = m[y * w + k];
      across[y * w + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = across[k * w + x];
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * The range from a lasso (005 FR-504): the AI's candidates — the person's head (face skin and hair), the whole
 * person, the cut-outs made for the photo and those made at the lasso's hints — chosen by chooseCircled; the lasso
 * itself when none fits or there are no parts. On the parts' grid (or w × h without parts). `inside` (019 FR-1915,
 * the current engine's rule): the candidate gives the outline only, cut to the lasso grown by 2 % of the long side, so
 * nothing outside the lasso becomes the subject; without it the candidate is taken whole (the engines up to ver 1.33).
 */
export function lassoRange(lasso: Lasso, parts: PhotoParts | null, lassoCuts: Uint8Array[], w = parts?.w ?? 160, h = parts?.h ?? 120, inside = false): ThemeRange {
  const aim = lassoMask(lasso, w, h);
  if (!parts) return { w, h, mask: aim, source: 'lasso' };
  const candidates: Uint8Array[] = [];
  if (parts.classes && parts.person) {
    candidates.push(Uint8Array.from(parts.classes, (c) => (c === PART.faceSkin || c === PART.hair ? 255 : 0)));
    candidates.push(parts.person);
  }
  candidates.push(...parts.cuts, ...lassoCuts);
  const bits = (m: Uint8Array) => Uint8Array.from(m, (v) => (v > 127 ? 1 : 0));
  const k = chooseCircled(bits(aim), candidates.map(bits));
  if (k < 0) return { w, h, mask: aim, source: 'lasso' };
  if (!inside) return { w, h, mask: candidates[k], source: 'lasso+ai' };
  const reach = grown(aim, w, h, Math.max(1, Math.round(0.02 * Math.max(w, h))));
  return { w, h, mask: Uint8Array.from(candidates[k], (v, i) => (reach[i] ? v : 0)), source: 'lasso+ai' };
}
