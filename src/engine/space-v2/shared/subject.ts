import type { RgbImage } from '../../common/image/normalize';
import { clip } from '../../common/math';
import { blurChannel } from './color';
import { linearSmall } from './photo';
import { analyze } from '../../common/analysis/features';
import { sampleMap } from '../../common/analysis/features';

/**
 * The photo's subject without AI (Phase 13, FR-228, research R-214): what stands out from the backdrop.
 * On the small photo, each pixel's colour distance to the nearest colour seen along the frame's edges
 * (the backdrop), weighted towards the centre, is its "standing out". The largest connected area that
 * clearly stands out, with its holes filled, is the subject. Inexact outlines are expected; a photo where
 * nothing clearly stands out (an even pattern, a flat colour) has no subject.
 */
export interface Subject {
  /** Soft mask (0..1) on the small photo grid. */
  w: number;
  h: number;
  mask: Float32Array;
  /** Bounding box in normalised photo coordinates: u0, v0, u1, v1. */
  box: [number, number, number, number];
  /** Mask value at normalised photo coordinates (bilinear, 0 outside). */
  at(u: number, v: number): number;
}

export function estimateSubject(img: RgbImage): Subject | null {
  const s = linearSmall(img);
  const { w, h } = s;
  const n = w * h;
  if (w < 8 || h < 8) return null;
  // Perceptual-ish colour (square root of linear light), lightly blurred so texture does not stand out.
  const ch = [s.r, s.g, s.b].map((c) => {
    const o = Float32Array.from(c, (v) => Math.sqrt(Math.max(0, v)));
    blurChannel(o, w, h, 1);
    return o;
  });
  const f = analyze(img);
  // Local detail, blurred so the inside of a textured subject counts too (not only its outline).
  const Gs = Float32Array.from(f.maps.G);
  blurChannel(Gs, f.analysisWidth, f.analysisHeight, Math.max(1, Math.round(f.analysisWidth * 0.03)));
  const G = { G: Gs, w: f.analysisWidth, h: f.analysisHeight };
  // Backdrop colours: samples along a band at the frame's edges.
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.06));
  const border: number[] = [];
  const step = Math.max(1, Math.round((2 * (w + h) * band) / 160));
  let k = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= band && y >= band && x < w - band && y < h - band) continue;
      if (k++ % step === 0) border.push(y * w + x);
    }
  }
  const stand = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let d = Infinity;
      for (const b of border) {
        const dr = ch[0][i] - ch[0][b];
        const dg = ch[1][i] - ch[1][b];
        const db = ch[2][i] - ch[2][b];
        const e = dr * dr + dg * dg + db * db;
        if (e < d) d = e;
      }
      const cx = (x + 0.5) / w - 0.5;
      const cy = (y + 0.5) / h - 0.5;
      const centre = Math.exp(-(cx * cx) / (2 * 0.3 * 0.3) - (cy * cy) / (2 * 0.35 * 0.35));
      // A subject has detail (edges, texture); a plain sky can differ in colour from the edges but is not one.
      const g = sampleMap(G.G, G.w, G.h, (x + 0.5) / w, (y + 0.5) / h);
      stand[i] = Math.sqrt(d) * (0.35 + 0.65 * centre) * (0.25 + 0.75 * clip(g / 0.12, 0, 1));
    }
  }
  const sorted = Float32Array.from(stand).sort();
  const q99 = sorted[Math.floor(0.99 * (n - 1))];
  if (!(q99 > 0.08)) return null;
  const t = 0.4 * q99;
  // Largest connected area above the threshold (by total standing out).
  const label = new Int32Array(n).fill(-1);
  let best = -1;
  let bestMass = 0;
  let comps = 0;
  for (let i = 0; i < n; i++) {
    if (stand[i] <= t || label[i] >= 0) continue;
    let mass = 0;
    const stack = [i];
    label[i] = comps;
    while (stack.length) {
      const j = stack.pop()!;
      mass += stand[j];
      const x = j % w;
      const y = (j - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (label[q] < 0 && stand[q] > t) {
          label[q] = comps;
          stack.push(q);
        }
      }
    }
    if (mass > bestMass) {
      bestMass = mass;
      best = comps;
    }
    comps++;
  }
  if (best < 0) return null;
  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) if (label[i] === best) mask[i] = 1;
  // Fill holes: whatever the backdrop cannot reach from the frame's edge belongs to the subject.
  const reach = new Uint8Array(n);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (!mask[y * w + x] && !reach[y * w + x]) (reach[y * w + x] = 1), stack.push(y * w + x);
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (!mask[y * w + x] && !reach[y * w + x]) (reach[y * w + x] = 1), stack.push(y * w + x);
  while (stack.length) {
    const j = stack.pop()!;
    const x = j % w;
    const y = (j - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (!mask[q] && !reach[q]) {
        reach[q] = 1;
        stack.push(q);
      }
    }
  }
  let area = 0;
  let inS = 0;
  let outS = 0;
  for (let i = 0; i < n; i++) {
    if (!reach[i]) mask[i] = 1;
    if (mask[i]) {
      area++;
      inS += stand[i];
    } else outS += stand[i];
  }
  const frac = area / n;
  // A subject is a clear part of the photo, not a speck and not the whole frame.
  if (frac < 0.02 || frac > 0.6) return null;
  if (inS / area < 2.5 * (outS / Math.max(1, n - area))) return null;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  blurChannel(mask, w, h, 1);
  const at = (u: number, v: number) => {
    if (u < 0 || v < 0 || u > 1 || v > 1) return 0;
    const fx = clip(u * w - 0.5, 0, w - 1);
    const fy = clip(v * h - 0.5, 0, h - 1);
    const xa = Math.floor(fx);
    const ya = Math.floor(fy);
    const xb = Math.min(w - 1, xa + 1);
    const yb = Math.min(h - 1, ya + 1);
    const tx = fx - xa;
    const ty = fy - ya;
    return (mask[ya * w + xa] * (1 - tx) + mask[ya * w + xb] * tx) * (1 - ty) + (mask[yb * w + xa] * (1 - tx) + mask[yb * w + xb] * tx) * ty;
  };
  return { w, h, mask, box: [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h], at };
}
