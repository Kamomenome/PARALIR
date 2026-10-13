import { sampleMap, type ImageFeatures } from '../../../common/analysis/features';
import type { RgbImage } from '../../../common/image/normalize';
import { clip, mirror, smoothstep } from '../../../common/math';
import { lookup, type EffectiveFeatures } from '../../../common/analysis/effective';
import { focalPx, unproject } from './camera';
import { mipSampler, type ForegroundAlgo } from './background';
import type { SpaceComposition } from './composite';
import { renderGrowth, type Layer, type PixelMap } from './growth';
import type { SpaceLayout } from './layout';
import { renderParts, type Plate } from './parts';
import { linearSmall, type SmallImage } from './photo';
import { drawsFrom } from './seeds';
import { blurChannel } from './hdr';
import type { SpaceControls } from './types';

/**
 * Phase 9: foregrounds whose shapes come only from the photo — no designed skeleton.
 *
 * - plates: the photo's fragments in space (rectangular cut-outs with irregular edges).
 * - cutouts: the same fragments, cut along the photo's own object boundaries.
 * - contours: the photo's lines (building edges, poles, sign frames, road markings) extruded into depth.
 * - surface: the photo itself bent into a continuous wall around the void, its brightness as relief.
 * - kaleidoscope: the photo between mirrors — wedge mirrors and ring mirrors around the void, in layers.
 * - rorschach: ink blots made of the photo's dark (or bright) masses, folded left/right like the inkblot test.
 * - structures: the earlier plates + grown branches (kept for comparison, chosen only on screen).
 */

export interface ContourParams {
  cu: number;
  cv: number;
  /** Photo heights per world unit. */
  scale: number;
  /** Spiral turn per e-fold of depth. */
  twist: number;
}

export interface SurfaceParams {
  radius: number;
  relief: number;
  folds: number;
  foldAmp: number;
  twist: number;
  uReps: number;
  vScale: number;
  phase: number;
}

export interface KaleidoLayer {
  z: number;
  scale: number;
  rot: number;
  cu: number;
  cv: number;
}

export interface KaleidoParams {
  /** Wedge mirrors: 2·order-fold dihedral symmetry. */
  order: number;
  /** Ring mirrors: the radius folds between r0 and r0·ratio. */
  r0: number;
  ratio: number;
  layers: KaleidoLayer[];
}

export interface Blot {
  z: number;
  cu: number;
  cv: number;
  scale: number;
  /** Quantile of the photo's blurred brightness that becomes the ink's edge. */
  level: number;
  /** Ink = dark masses (true) or bright masses (false). */
  dark: boolean;
  /** Screen-space reach of the blot (half-heights) and its vertical offset. */
  reach: number;
  lift: number;
}

export interface ForegroundParams {
  contours: ContourParams;
  surface: SurfaceParams;
  kaleidoscope: KaleidoParams;
  rorschach: { blots: Blot[] };
}

/** The most detailed of four candidate points (normalised photo coordinates). */
function detailed(d: number[], e: EffectiveFeatures): [number, number] {
  let best: [number, number] = [d[0], d[1]];
  let bw = -1;
  for (let c = 0; c < 4; c++) {
    const g = lookup(e, 'G', d[c * 2], d[c * 2 + 1]);
    if (g > bw) {
      bw = g;
      best = [d[c * 2], d[c * 2 + 1]];
    }
  }
  return [clip(best[0], 0.1, 0.9), clip(best[1], 0.1, 0.9)];
}

/** Fixed draws for every foreground, whichever is used. */
export async function buildForegrounds(stream: Uint8Array, e: EffectiveFeatures): Promise<ForegroundParams> {
  const c = await drawsFrom(stream, 'foreground/contours', 8 + 2);
  const [cu, cv] = detailed(c, e);
  const contours: ContourParams = { cu, cv, scale: 0.25 + 0.25 * c[8], twist: c[9] < 0.4 ? 0 : (c[9] - 0.7) * 1.2 };
  const s = await drawsFrom(stream, 'foreground/surface', 8);
  const surface: SurfaceParams = {
    radius: 0.9 + 0.5 * s[0],
    relief: 0.25 + 0.5 * s[1],
    folds: 2 + Math.floor(s[2] * 5),
    foldAmp: 0.05 + 0.25 * s[3],
    twist: (s[4] - 0.5) * 1.6,
    uReps: 2 * (1 + Math.floor(s[5] * 2)),
    vScale: 0.6 + 0.6 * s[6],
    phase: 2 * Math.PI * s[7],
  };
  const k = await drawsFrom(stream, 'foreground/kaleidoscope', 3 + 3 * (8 + 3));
  const layers: KaleidoLayer[] = [];
  for (let l = 0; l < 3; l++) {
    const d = k.slice(3 + l * 11, 3 + (l + 1) * 11);
    const [lu, lv] = detailed(d, e);
    layers.push({ z: [1.6, 3.2, 6.5][l] * (0.85 + 0.3 * d[8]), scale: 0.18 + 0.25 * d[9], rot: 2 * Math.PI * d[10], cu: lu, cv: lv });
  }
  const kaleidoscope: KaleidoParams = { order: 3 + Math.floor(k[0] * 5), r0: 0.25 + 0.3 * k[1], ratio: 1.8 + 1.4 * k[2], layers };
  const r = await drawsFrom(stream, 'foreground/rorschach', 4 * (8 + 6));
  const blots: Blot[] = [];
  for (let b = 0; b < 4; b++) {
    const d = r.slice(b * 14, (b + 1) * 14);
    const [bu, bv] = detailed(d, e);
    blots.push({
      z: [1.5, 2.4, 3.8, 6.0][b] * (0.85 + 0.3 * d[8]),
      cu: bu,
      cv: bv,
      scale: 0.2 + 0.3 * d[9],
      level: 0.3 + 0.3 * d[10],
      dark: d[11] < 0.65,
      reach: 0.45 + 0.55 * d[12],
      lift: (d[13] - 0.5) * 0.8,
    });
  }
  return { contours, surface, kaleidoscope, rorschach: { blots } };
}

// ---------- photo-derived maps (cached per photo) ----------

interface Maps {
  small: SmallImage;
  /** Line strength of the photo (0..~1), at up to 512 px. */
  edge: { w: number; h: number; e: Float32Array };
  /** Blurred brightness (ink masses) and a heavier blur (ink bleeding), on the small image. */
  blur: Float32Array;
  blur2: Float32Array;
  blurSorted: Float32Array;
}

const cache = new WeakMap<RgbImage, Maps>();

function mapsOf(img: RgbImage): Maps {
  const hit = cache.get(img);
  if (hit) return hit;
  const small = linearSmall(img);
  // Line strength: Sobel on a ≤512 px luminance (box-averaged), normalised by its 97th percentile.
  const k = Math.max(1, Math.ceil(Math.max(img.width, img.height) / 512));
  const w = Math.max(1, Math.floor(img.width / k));
  const h = Math.max(1, Math.floor(img.height / k));
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
        const p = ((y * k + j) * img.width + x * k + i) * 3;
        s += 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
      }
      lum[y * w + x] = s / (k * k * 255);
    }
  }
  const e = new Float32Array(w * h);
  const at = (x: number, y: number) => lum[clip(y, 0, h - 1) * w + clip(x, 0, w - 1)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      e[y * w + x] = Math.hypot(gx, gy);
    }
  }
  const sorted = Float32Array.from(e).sort();
  const p97 = sorted[Math.floor(0.97 * (sorted.length - 1))];
  // A flat photo has no lines: an absolute floor keeps noise from being stretched into lines.
  const norm = Math.max(p97, 0.25);
  for (let i = 0; i < e.length; i++) e[i] /= norm;
  const sl = new Float32Array(small.w * small.h);
  for (let p = 0; p < sl.length; p++) sl[p] = Math.sqrt(0.2126 * small.r[p] + 0.7152 * small.g[p] + 0.0722 * small.b[p]);
  const blur = Float32Array.from(sl);
  blurChannel(blur, small.w, small.h, Math.max(1, Math.round(small.w * 0.012)));
  const blur2 = Float32Array.from(sl);
  blurChannel(blur2, small.w, small.h, Math.max(1, Math.round(small.w * 0.05)));
  const m: Maps = { small, edge: { w, h, e }, blur, blur2, blurSorted: Float32Array.from(blur).sort() };
  cache.set(img, m);
  return m;
}

function sample1(m: Float32Array, w: number, h: number, u: number, v: number): number {
  const x = mirror(u) * (w - 1);
  const y = mirror(v) * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  return (m[y0 * w + x0] * (1 - fx) + m[y0 * w + x1] * fx) * (1 - fy) + (m[y1 * w + x0] * (1 - fx) + m[y1 * w + x1] * fx) * fy;
}

/** Folds a world point (around the depth axis = the void) by the layout's symmetry. */
function foldSym(L: Pick<SpaceLayout, 'symmetry' | 'order'>, x: number, y: number): [number, number] {
  if (L.symmetry === 'mirror') return [Math.abs(x), y];
  if (L.symmetry === 'rotational') {
    const r = Math.hypot(x, y);
    const w = (2 * Math.PI) / L.order;
    const a = Math.atan2(y, x);
    const af = a - w * Math.floor(a / w);
    return [r * Math.cos(af), r * Math.sin(af)];
  }
  return [x, y];
}

// ---------- cutouts ----------

export interface CutMask {
  w: number;
  h: number;
  a: Float32Array;
}

/**
 * The object under a plate's centre: region growing on the small photo inside the crop (colour close
 * to the seed and to its neighbour), softened, fading out before the crop's border.
 */
export function cutoutMask(small: SmallImage, crop: [number, number, number], aspect: number): CutMask {
  const [cu, cv, half] = crop;
  const w = Math.max(8, Math.round(((2 * half) / aspect) * small.w));
  const h = Math.max(8, Math.round(2 * half * small.h));
  const n = w * h;
  const cr = new Float32Array(n);
  const cg = new Float32Array(n);
  const cb = new Float32Array(n);
  const tmp = [0, 0, 0];
  const sampleAt = (u: number, v: number) => {
    const x = clip(u, 0, 1) * (small.w - 1);
    const y = clip(v, 0, 1) * (small.h - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(small.w - 1, x0 + 1);
    const y1 = Math.min(small.h - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    for (const [k, ch] of [[0, small.r], [1, small.g], [2, small.b]] as const) {
      tmp[k] = Math.sqrt((ch[y0 * small.w + x0] * (1 - fx) + ch[y0 * small.w + x1] * fx) * (1 - fy) + (ch[y1 * small.w + x0] * (1 - fx) + ch[y1 * small.w + x1] * fx) * fy);
    }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      sampleAt(cu + (((x + 0.5) / w - 0.5) * 2 * half) / aspect, cv + ((y + 0.5) / h - 0.5) * 2 * half);
      const i = y * w + x;
      cr[i] = tmp[0];
      cg[i] = tmp[1];
      cb[i] = tmp[2];
    }
  }
  const dist = (i: number, j: number) => Math.hypot(cr[i] - cr[j], cg[i] - cg[j], cb[i] - cb[j]);
  const grow = (seed: number): Uint8Array => {
    const inside = new Uint8Array(n);
    const stack = [seed];
    inside[seed] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (inside[j]) continue;
        if (dist(i, j) < 0.09 && dist(seed, j) < 0.26) {
          inside[j] = 1;
          stack.push(j);
        }
      }
    }
    return inside;
  };
  const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);
  let region = grow(Math.floor(h / 2) * w + Math.floor(w / 2));
  // A centre on a thin line gives a sliver: then take the largest object around it.
  if (count(region) < 0.12 * n) {
    for (const [sx, sy] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
      const r = grow(Math.floor(sy * h) * w + Math.floor(sx * w));
      if (count(r) > count(region)) region = r;
    }
  }
  const a = Float32Array.from(region);
  blurChannel(a, w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x + 0.5, w - x - 0.5, y + 0.5, h - y - 0.5) / Math.min(w, h);
      a[y * w + x] = smoothstep((a[y * w + x] - 0.3) / 0.4) * smoothstep(edge / 0.06);
    }
  }
  return { w, h, a };
}

const maskCache = new WeakMap<RgbImage, Map<string, CutMask>>();

function masksFor(img: RgbImage, plates: Plate[]): (CutMask | null)[] {
  let byKey = maskCache.get(img);
  if (!byKey) {
    byKey = new Map();
    maskCache.set(img, byKey);
  }
  const small = mapsOf(img).small;
  const aspect = img.width / img.height;
  const out: (CutMask | null)[] = [];
  for (const p of plates) {
    const key = p.crop.join(',');
    let m = byKey.get(key);
    if (!m) {
      m = cutoutMask(small, p.crop, aspect);
      byKey.set(key, m);
    }
    out[p.slot] = m;
  }
  return out;
}

// ---------- rendering ----------

type Tint = ((c: number[]) => void) | null;

/** Draws the chosen foreground into the layer (linear colour, coverage, depth). */
export function renderForeground(
  kind: ForegroundAlgo,
  comp: SpaceComposition,
  img: RgbImage,
  features: ImageFeatures,
  c: SpaceControls,
  layer: Layer,
  rimMap: PixelMap | null,
  plateTint: ((slot: number) => Tint) | null,
  nearMask?: Uint8Array,
): void {
  const glow = 0.3 + 0.9 * c.glow;
  const detail = { G: features.maps.G, w: features.analysisWidth, h: features.analysisHeight };
  if (kind === 'structures' || kind === 'plates' || kind === 'cutouts') {
    renderParts(comp.parts, img, comp.camera, layer, {
      rings: Math.round(6 + 6 * c.depth),
      heroSize: 0.6 + 0.8 * c.shapeRetention,
      heroAlpha: clip(0.3 + 1.2 * c.shapeRetention, 0, 1),
      light: kind === 'structures' ? 0.24 : 0.28,
      rim: 0.35 * glow,
      rimMap,
      nearMask,
      detail,
      plateTint: plateTint ? comp.surreal.plates.map((_, i) => plateTint(i)) : undefined,
      masks: kind === 'cutouts' ? masksFor(img, comp.parts.plates) : undefined,
    });
    if (kind === 'structures') {
      renderGrowth(comp.growth, img, comp.camera, layer, {
        arches: Math.round(4 + 5 * c.depth),
        membrane: 0.8 * c.organic,
        brightness: 0.5 + 0.9 * c.organic,
        rim: (0.5 + 0.9 * c.organic) * glow,
        rimMap,
      });
    }
    return;
  }
  // Lit like the plates: dim photo surfaces in a dark space, so the light and the glow carry the contrast.
  const lit = 0.2 + 0.2 * c.shapeRetention;
  const rim = 0.4 * glow;
  if (kind === 'contours') contoursLayer(comp, img, layer, lit, rimMap, rim);
  else if (kind === 'surface') surfaceLayer(comp, img, detail, layer, lit, rimMap, rim);
  else if (kind === 'kaleidoscope') kaleidoLayer(comp, img, detail, layer, lit, rimMap, rim);
  else rorschachLayer(comp, img, detail, layer, lit, rimMap, rim);
}

/** Front-to-back accumulation of semi-transparent samples along one pixel's view ray. */
class Ray {
  r = 0;
  g = 0;
  b = 0;
  T = 1;
  z = Infinity;
  add(col: number[], a: number, z: number): void {
    if (a <= 0) return;
    this.r += this.T * a * col[0];
    this.g += this.T * a * col[1];
    this.b += this.T * a * col[2];
    this.T *= 1 - a;
    if (this.z === Infinity && this.T < 0.5) this.z = z;
  }
  write(layer: Layer, i: number, rimMap: PixelMap | null, rim: number, lastZ: number): void {
    const A = 1 - this.T;
    if (A <= 1e-4) return;
    const rm = rimMap ? rim : 0;
    layer.r[i] = this.r / A + (rimMap ? rimMap.r[i] * rm : 0);
    layer.g[i] = this.g / A + (rimMap ? rimMap.g[i] * rm : 0);
    layer.b[i] = this.b / A + (rimMap ? rimMap.b[i] * rm : 0);
    layer.a[i] = A;
    layer.depth[i] = this.z === Infinity ? lastZ : this.z;
  }
}

/** The photo's lines extruded into depth: the same line drawing on many depth slices, near to far. */
function contoursLayer(comp: SpaceComposition, img: RgbImage, layer: Layer, lit: number, rimMap: PixelMap | null, rim: number): void {
  const { W, H } = layer;
  const p = comp.foregrounds.contours;
  const L = comp.layout;
  const { edge } = mapsOf(img);
  const sample = mipSampler(img);
  const aspect = img.width / img.height;
  const f = focalPx(comp.camera, H);
  const K = 48;
  const zNear = 1.1;
  const zFar = 24;
  const zs = Array.from({ length: K }, (_, k) => zNear * Math.pow(zFar / zNear, k / (K - 1)));
  const tw = zs.map((z) => [Math.cos(p.twist * Math.log(z)), Math.sin(p.twist * Math.log(z))]);
  const col = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [dx, dy] = unproject(comp.camera, x + 0.5, y + 0.5, W, H);
      const ray = new Ray();
      let lastZ = zFar;
      for (let k = 0; k < K && ray.T > 0.02; k++) {
        const z = zs[k];
        const [c, s] = tw[k];
        const [fx, fy] = foldSym(L, c * dx * z - s * dy * z, s * dx * z + c * dy * z);
        const u = p.cu + (fx * p.scale) / aspect;
        const v = p.cv + fy * p.scale;
        // Only the photo's own frame is extruded (no endless tiling into the distance).
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const e = sample1(edge.e, edge.w, edge.h, u, v);
        const a = 0.45 * smoothstep((e - 0.3) / 0.4);
        if (a <= 0.002) continue;
        sample(u, v, (z / f) * p.scale * img.height, col);
        for (let q = 0; q < 3; q++) col[q] *= lit * 1.3;
        ray.add(col, a, z);
        lastZ = z;
      }
      ray.write(layer, y * W + x, rimMap, rim * 0.6, lastZ);
    }
  }
}

/** The photo bent into a continuous wall around the void: a tube whose radius folds and bulges with the photo's brightness. */
function surfaceLayer(comp: SpaceComposition, img: RgbImage, detail: { G: Float32Array; w: number; h: number }, layer: Layer, lit: number, rimMap: PixelMap | null, rim: number): void {
  const { W, H } = layer;
  const p = comp.foregrounds.surface;
  const L = comp.layout;
  const { small } = mapsOf(img);
  const sample = mipSampler(img);
  const f = focalPx(comp.camera, H);
  // Relief from the photo's smoothed brightness: soft folds and bulges, not spikes.
  const { blur } = mapsOf(img);
  const lumAt = (u: number, v: number) => sample1(blur, small.w, small.h, u, v);
  const poly = L.symmetry === 'rotational';
  /** Angular coordinate in [0, 1] under the layout's symmetry (continuous). */
  const sOf = (dx: number, dy: number) => {
    if (L.symmetry === 'mirror') return Math.abs(Math.atan2(dx, dy)) / Math.PI;
    if (poly) return mirror(Math.atan2(dy, dx) / (Math.PI / L.order));
    return (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
  };
  const uvOf = (s: number, z: number): [number, number] => [mirror(s * p.uReps + 0.5 * p.phase / Math.PI), mirror(p.vScale * Math.log(z) + 0.3)];
  const radiusAt = (s: number, z: number) => {
    const [u, v] = uvOf(s, z);
    const shape = poly ? Math.cos(Math.PI / L.order) / Math.cos((s * Math.PI) / L.order) : 1;
    return p.radius * shape * (1 + p.foldAmp * Math.sin(p.folds * 2 * Math.PI * s + p.twist * Math.log(z) + p.phase) + p.relief * (lumAt(u, v) - 0.5));
  };
  const col = [0, 0, 0];
  const zNear = 0.25;
  const zFar = 80;
  const steps = 40;
  const ratio = Math.pow(zFar / zNear, 1 / steps);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [dx, dy] = unproject(comp.camera, x + 0.5, y + 0.5, W, H);
      const rho = Math.hypot(dx, dy);
      if (rho < 1e-6) continue;
      const s = sOf(dx, dy);
      // March outwards along the ray until it leaves the tube, then refine.
      let z0 = zNear;
      let z1 = 0;
      for (let k = 0; k < steps; k++) {
        const z = z0 * ratio;
        if (rho * z - radiusAt(s, z) >= 0) {
          z1 = z;
          break;
        }
        z0 = z;
      }
      if (z1 === 0) continue;
      for (let it = 0; it < 6; it++) {
        const zm = Math.sqrt(z0 * z1);
        if (rho * zm - radiusAt(s, zm) >= 0) z1 = zm;
        else z0 = zm;
      }
      const z = Math.sqrt(z0 * z1);
      const [u, v] = uvOf(s, z);
      sample(u, v, (img.height * p.vScale) / (rho * f), col);
      // Relief shading: slopes of the wall along depth and around it, lit from one side.
      const e = 0.01;
      const gz = (radiusAt(s, z * Math.exp(e)) - radiusAt(s, z * Math.exp(-e))) / (2 * e);
      const gs = (radiusAt(Math.min(1, s + e), z) - radiusAt(Math.max(0, s - e), z)) / (2 * e);
      const shade = clip(0.8 + (1.2 * gz - 0.25 * gs) / p.radius, 0.25, 1.4) * lit;
      const a = 0.25 + 0.75 * smoothstep(sampleMap(detail.G, detail.w, detail.h, u, v) / 0.2);
      const i = y * W + x;
      const grazing = clip(1 - rho * 1.2, 0, 1);
      layer.r[i] = col[0] * shade + (rimMap ? rimMap.r[i] * rim * grazing : 0);
      layer.g[i] = col[1] * shade + (rimMap ? rimMap.g[i] * rim * grazing : 0);
      layer.b[i] = col[2] * shade + (rimMap ? rimMap.b[i] * rim * grazing : 0);
      layer.a[i] = a;
      layer.depth[i] = z;
    }
  }
}

/** The photo between mirrors: wedge mirrors (2·order-fold) and ring mirrors around the void, in three depth layers. */
function kaleidoLayer(comp: SpaceComposition, img: RgbImage, detail: { G: Float32Array; w: number; h: number }, layer: Layer, lit: number, rimMap: PixelMap | null, rim: number): void {
  const { W, H } = layer;
  const p = comp.foregrounds.kaleidoscope;
  const sample = mipSampler(img);
  const aspect = img.width / img.height;
  const f = focalPx(comp.camera, H);
  const wedge = Math.PI / p.order;
  const lq = Math.log(p.ratio);
  const col = [0, 0, 0];
  const rots = p.layers.map((l) => [Math.cos(l.rot), Math.sin(l.rot)]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [dx, dy] = unproject(comp.camera, x + 0.5, y + 0.5, W, H);
      const ray = new Ray();
      let lastZ = 0;
      for (let l = 0; l < p.layers.length && ray.T > 0.02; l++) {
        const ly = p.layers[l];
        const wx = dx * ly.z;
        const wy = dy * ly.z;
        const r = Math.hypot(wx, wy);
        if (r < 1e-9) continue;
        const a = wedge * mirror(Math.atan2(wx, wy) / wedge);
        const rr = p.r0 * Math.exp(lq * mirror(Math.log(r / p.r0) / lq));
        const lx = rr * Math.sin(a);
        const lyy = rr * Math.cos(a);
        const [c, s] = rots[l];
        const u = ly.cu + ((c * lx - s * lyy) * ly.scale) / aspect;
        const v = ly.cv + (s * lx + c * lyy) * ly.scale;
        // Lace: the photo's detailed parts are glass-solid, its flat parts let the deeper layers through.
        const alpha = 0.92 * smoothstep((sampleMap(detail.G, detail.w, detail.h, mirror(u), mirror(v)) - 0.04) / 0.18);
        if (alpha <= 0.002) continue;
        sample(mirror(u), mirror(v), (ly.z / f) * ly.scale * img.height * 2, col);
        for (let q = 0; q < 3; q++) col[q] *= lit * 1.1;
        ray.add(col, alpha, ly.z);
        lastZ = ly.z;
      }
      ray.write(layer, y * W + x, rimMap, rim * 0.5, lastZ);
    }
  }
}

/** Ink blots of the photo's dark (or bright) masses, folded left/right about the vertical through the void. */
function rorschachLayer(comp: SpaceComposition, img: RgbImage, detail: { G: Float32Array; w: number; h: number }, layer: Layer, lit: number, rimMap: PixelMap | null, rim: number): void {
  const { W, H } = layer;
  const { small, blur, blur2, blurSorted } = mapsOf(img);
  const sample = mipSampler(img);
  const aspect = img.width / img.height;
  const f = focalPx(comp.camera, H);
  const tanHalf = Math.tan(comp.camera.fov / 2);
  const blots = comp.foregrounds.rorschach.blots.map((b) => ({
    ...b,
    T: blurSorted[Math.floor(b.level * (blurSorted.length - 1))] ?? 0,
    R: b.reach * tanHalf * b.z,
    yc: b.lift * tanHalf * b.z,
  }));
  const col = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [dx, dy] = unproject(comp.camera, x + 0.5, y + 0.5, W, H);
      const ray = new Ray();
      let lastZ = 0;
      for (const b of blots) {
        if (ray.T <= 0.02) break;
        const wx = Math.abs(dx * b.z);
        const wy = dy * b.z - b.yc;
        // The ink bleeds: its outline is pushed around by the photo's own large masses.
        const u0 = b.cu + (wx / b.R) * b.scale / aspect;
        const v0 = b.cv + (wy / b.R) * b.scale;
        const bleed = sample1(blur2, small.w, small.h, u0, v0) - 0.5;
        const u = u0 + 0.04 * bleed;
        const v = v0 - 0.04 * bleed;
        const lb = sample1(blur, small.w, small.h, u, v);
        const ink = b.dark ? smoothstep((b.T - lb) / 0.04) : smoothstep((lb - b.T) / 0.04);
        const reach = b.R * (0.75 + 0.5 * sample1(blur2, small.w, small.h, u0 + 0.13, v0 + 0.07));
        const env = smoothstep((reach - Math.hypot(wx, wy)) / (0.25 * b.R));
        // Flat masses (a plain sky) stay a thin wash; detailed ones are dense ink.
        const alpha = 0.95 * ink * env * (0.3 + 0.7 * smoothstep(sampleMap(detail.G, detail.w, detail.h, mirror(u0), mirror(v0)) / 0.15));
        if (alpha <= 0.002) continue;
        sample(mirror(u0), mirror(v0), (b.z / f) * (b.scale / b.R) * img.height, col);
        for (let q = 0; q < 3; q++) col[q] *= lit * 1.1;
        ray.add(col, alpha, b.z);
        lastZ = b.z;
      }
      ray.write(layer, y * W + x, rimMap, rim * 0.6, lastZ);
    }
  }
}
