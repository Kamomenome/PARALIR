import type { RgbImage } from '../../../common/image/normalize';
import { bilinearReflect, clip, smoothstep } from '../../../common/math';
import { sampleMap } from '../../../common/analysis/features';
import { lookup, type EffectiveFeatures } from '../../../common/analysis/effective';
import { project, NEAR, type Camera } from './camera';
import type { Layer } from './growth';
import { srgbToLinear } from './hdr';
import type { Arrangement, SpaceLayout } from './layout';
import { drawsFrom } from './seeds';
import type { Vec3 } from './types';

/**
 * ③ Spatial repetition of photo parts (research R-204): plates cut from the photo, shrinking and
 * multiplying into depth; a few large plates near the camera keep the parts readable. Rotation, flips
 * (including upside down) and ring twist mix up and down. Phase 6 (parts-v4): the seeded layout picks
 * the arrangement (tunnel, helix, shell, strata, scatter) and the symmetry (mirror, rotational, none).
 */

export interface Plate {
  /** Cut-out in normalised photo coordinates: centre u, v and half-size in photo heights. */
  crop: [number, number, number];
  centre: Vec3;
  /** Half-size in world units. */
  size: number;
  /** Orientation: right and up vectors of the plate in world space. */
  right: Vec3;
  up: Vec3;
  flipX: boolean;
  flipY: boolean;
  /** Edge noise phases. */
  edge: [number, number, number];
  ring: number;
  hero: boolean;
  /** Source slot (ring × per-ring index, then heroes); symmetric copies share it (Phase 7 colour). */
  slot: number;
}

export interface PartsParams {
  version: 'parts-v5';
  plates: Plate[];
}

const RINGS = 12;
const PER_RING = 10;
const HEROES = 3;
const CANDIDATES = 6;
const PLATE_DRAWS = CANDIDATES * 2 + 12;
/** Fixed number of plate slots (for per-plate draws elsewhere). */
export const PLATE_SLOTS = RINGS * PER_RING + HEROES;

const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Weighted pick among candidate cut-outs: edges preferred, quiet areas kept (as in world-v3). */
function pickCrop(d: number[], e: EffectiveFeatures, aspect: number, sizeU: number): [number, number, number] {
  let total = 0;
  const w: number[] = [];
  for (let c = 0; c < CANDIDATES; c++) {
    const g = lookup(e, 'G', d[c * 2], d[c * 2 + 1]);
    // Detailed areas strongly preferred; flat areas (e.g. sky) still possible but rare.
    w.push(0.06 + 0.94 * clip(g * (0.5 + e.K) * 2.5, 0, 1) ** 1.5);
    total += w[c];
  }
  let t = d[CANDIDATES * 2] * total;
  let k = CANDIDATES - 1;
  for (let c = 0; c < CANDIDATES; c++) {
    if (t < w[c]) {
      k = c;
      break;
    }
    t -= w[c];
  }
  const half = Math.min(sizeU, 0.5, aspect / 2);
  const u = clip(d[k * 2], half / aspect, 1 - half / aspect);
  const v = clip(d[k * 2 + 1], half, 1 - half);
  return [u, v, half];
}

/** Left/right mirror image of a plate (regular symmetry around irregular content). */
function mirrorPlate(p: Plate): Plate {
  return {
    ...p,
    centre: [-p.centre[0], p.centre[1], p.centre[2]],
    right: [-p.right[0], p.right[1], p.right[2]],
    up: [-p.up[0], p.up[1], p.up[2]],
  };
}

/** The plate rotated about the depth axis (rotational symmetry). */
function rotatePlate(p: Plate, ang: number, sizeK = 1): Plate {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const r = (v: Vec3): Vec3 => [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
  return { ...p, centre: r(p.centre), right: r(p.right), up: r(p.up), size: p.size * sizeK };
}

/** Plate frame from a normal and a spin around it. */
function frame(normal: Vec3, spin: number): { right: Vec3; up: Vec3 } {
  const ref: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const r0 = norm(cross(ref, normal));
  const u0 = cross(normal, r0);
  const right: Vec3 = norm([r0[0] * Math.cos(spin) + u0[0] * Math.sin(spin), r0[1] * Math.cos(spin) + u0[1] * Math.sin(spin), r0[2] * Math.cos(spin) + u0[2] * Math.sin(spin)]);
  return { right, up: norm(cross(normal, right)) };
}

/** Angular domain filled by the source plates; the symmetry fills the rest. */
function domain(L: Pick<SpaceLayout, 'symmetry' | 'order'>): { a0: number; span: number; count: number } {
  if (L.symmetry === 'mirror') return { a0: -Math.PI / 2, span: Math.PI, count: PER_RING / 2 };
  if (L.symmetry === 'rotational') return { a0: 0, span: (2 * Math.PI) / L.order, count: Math.ceil(PER_RING / L.order) };
  return { a0: 0, span: 2 * Math.PI, count: PER_RING };
}

/** Copies of a source plate under the layout's symmetry. */
function symmetric(p: Plate, L: Pick<SpaceLayout, 'symmetry' | 'order'>, sizeK = 1): Plate[] {
  if (L.symmetry === 'mirror') return [p, mirrorPlate(p)];
  if (L.symmetry === 'rotational') return Array.from({ length: L.order }, (_, n) => rotatePlate(p, (2 * Math.PI * n) / L.order, sizeK));
  return [p];
}

/**
 * Where a source plate sits for each arrangement (Phase 6). `ang` is its angle inside the symmetry
 * domain, `k` its depth layer, `d` its own draws (from index j).
 */
function place(arr: Arrangement, ang: number, k: number, slot: number, twist: number, d: number[], j: number): { centre: Vec3; normal: Vec3; sizeK: number } {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const jz = 1 + 0.12 * (d[j + 3] - 0.5);
  const facing = 0.35 + 0.5 * d[j + 4];
  const toAxis = (x: number, y: number, f: number): Vec3 => {
    const l = Math.hypot(x, y) || 1;
    return norm([(-x / l) * (1 - f), (-y / l) * (1 - f), -f]);
  };
  switch (arr) {
    case 'tunnel': {
      const radius = 1.2 * (0.9 + 0.35 * d[j + 2]);
      return { centre: [radius * ca, radius * sa, 1.3 * Math.pow(1.3, k) * jz], normal: toAxis(ca, sa, facing), sizeK: 1 };
    }
    case 'helix': {
      // A coil winding into depth: each layer turns further; the radius breathes along the coil.
      const t = k + slot;
      const a = ang + 0.55 * t * (0.6 + twist);
      const radius = 0.75 + 0.45 * Math.sin(0.9 * t + 6 * twist) + 0.3 * d[j + 2];
      const x = radius * Math.cos(a);
      const y = radius * Math.sin(a);
      return { centre: [x, y, 1.25 * Math.pow(1.24, t) * jz], normal: toAxis(x, y, 0.55 + 0.4 * d[j + 4]), sizeK: 0.9 };
    }
    case 'shell': {
      // The inner wall of a hollow sphere around the viewer: rings run from the far pole towards the camera.
      const R = 2.6;
      // theta from the far pole (0) towards the camera; a small cap around the pole stays open for the void.
      const theta = Math.PI * (0.12 + (0.66 * (RINGS - 1 - k + 0.5 * d[j + 3])) / RINGS);
      const c: Vec3 = [0, 0, 2.4];
      const p: Vec3 = [c[0] + R * Math.sin(theta) * ca, c[1] + R * Math.sin(theta) * sa, c[2] + R * Math.cos(theta)];
      const inward = norm([c[0] - p[0], c[1] - p[1], c[2] - p[2]]);
      const normal = norm([inward[0] * (1 - facing * 0.5), inward[1] * (1 - facing * 0.5), inward[2] - facing * 0.5]);
      // Plates shrink towards the far pole, so the shell still has a fine, distant end.
      return { centre: p, normal, sizeK: 2.2 - 1.5 * (k / (RINGS - 1)) };
    }
    case 'strata': {
      // Floor and ceiling layers: the circle flattened onto two planes, plates lying on them.
      const h = 0.85 + 0.35 * d[j + 2];
      const side = sa >= 0 ? 1 : -1;
      const x = 2.6 * ca;
      const tilt = 0.25 * (d[j + 4] - 0.5);
      return { centre: [x, side * h, 1.25 * Math.pow(1.28, k) * jz], normal: norm([tilt, -side, -0.25 - 0.3 * facing]), sizeK: 1.15 };
    }
    case 'scatter': {
      // Plates drifting freely in the volume around the void, at irregular depths.
      const radius = 0.55 + 1.5 * d[j + 2];
      const z = 1.4 * Math.pow(1.32, k + 1.2 * (d[j + 3] - 0.5));
      return { centre: [radius * ca, radius * sa, z], normal: norm([0.6 * (d[j + 4] - 0.5), 0.6 * (d[j + 9] - 0.5), -1]), sizeK: 0.7 + 0.8 * d[j + 6] };
    }
  }
}

export async function buildParts(stream: Uint8Array, e: EffectiveFeatures, aspect: number, L: SpaceLayout): Promise<PartsParams> {
  const plates: Plate[] = [];
  const twist = (await drawsFrom(stream, 'parts/tunnel', 2))[0];
  const dom = domain(L);
  for (let k = 0; k < RINGS; k++) {
    // Fixed draws: every slot is drawn, the symmetry decides how many are used.
    for (let m = 0; m < PER_RING; m++) {
      const d = await drawsFrom(stream, `parts/plate/${String(k).padStart(2, '0')}-${m}`, PLATE_DRAWS);
      if (m >= dom.count) continue;
      const j = CANDIDATES * 2 + 1;
      const crop = pickCrop(d, e, aspect, 0.12 + 0.25 * d[j]);
      const jitter = L.symmetry === 'none' ? 0.9 : 0.6;
      const slot = (m + 0.5 + jitter * (d[j + 1] - 0.5)) / dom.count;
      const ang = dom.a0 + dom.span * slot + 0.35 * Math.sin(k * (0.5 + twist));
      const { centre, normal, sizeK } = place(L.arrangement, ang, k, slot, twist, d, j);
      const { right, up } = frame(normal, 2 * Math.PI * d[j + 5]);
      const plate: Plate = {
        crop,
        centre,
        size: 0.24 * (0.75 + 0.5 * d[j + 6]) * sizeK,
        right,
        up,
        flipX: d[j + 7] < 0.3,
        flipY: d[j + 8] < 0.3,
        edge: [d[j + 9] * 10, d[j + 10] * 10, 3 + 4 * d[j + 10]],
        ring: k,
        hero: false,
        slot: k * PER_RING + m,
      };
      plates.push(...symmetric(plate, L));
    }
  }
  // Large plates near the camera, mostly upright and readable, under the same symmetry.
  for (let h = 0; h < HEROES; h++) {
    const d = await drawsFrom(stream, `parts/hero/${h}`, PLATE_DRAWS);
    // Rotational symmetry repeats each hero `order` times: keep fewer and smaller ones.
    if (L.symmetry === 'rotational' && h >= (L.order <= 4 ? 2 : 1)) continue;
    const j = CANDIDATES * 2 + 1;
    const crop = pickCrop(d, e, aspect, 0.18 + 0.2 * d[j]);
    const side = L.symmetry === 'none' && d[j + 10] < 0.5 ? -1 : 1;
    const x = side * (0.35 + 0.45 * d[j + 1]);
    const y = (d[j + 2] - 0.4) * 0.9;
    const z = 1.0 + 0.9 * d[j + 3];
    const spin = (d[j + 5] - 0.5) * 0.7 + (d[j + 4] < 0.2 ? Math.PI : 0);
    const turnY = side * (0.25 + 0.35 * d[j + 6]);
    const right: Vec3 = norm([Math.cos(spin) * Math.cos(turnY), Math.sin(spin), Math.cos(spin) * Math.sin(turnY)]);
    const up: Vec3 = norm([-Math.sin(spin) * Math.cos(turnY), Math.cos(spin), -Math.sin(spin) * Math.sin(turnY)]);
    const hero: Plate = {
      crop,
      centre: [x, y, z],
      size: 0.3 + 0.18 * d[j + 7],
      right,
      up,
      flipX: d[j + 8] < 0.25,
      flipY: false,
      edge: [d[j + 9] * 10, d[j + 10] * 10, 3 + 4 * d[j + 10]],
      ring: -1,
      hero: true,
      slot: RINGS * PER_RING + h,
    };
    plates.push(...symmetric(hero, L, L.symmetry === 'rotational' ? Math.min(1, 3 / L.order) : 1));
  }
  return { version: 'parts-v5', plates };
}

/** Corners in screen space (or null when behind the camera). */
function screenQuad(p: Plate, cam: Camera, W: number, H: number, sizeK: number) {
  const s = p.size * sizeK;
  const corners: Vec3[] = [
    [p.centre[0] - p.right[0] * s - p.up[0] * s, p.centre[1] - p.right[1] * s - p.up[1] * s, p.centre[2] - p.right[2] * s - p.up[2] * s],
    [p.centre[0] + p.right[0] * s - p.up[0] * s, p.centre[1] + p.right[1] * s - p.up[1] * s, p.centre[2] + p.right[2] * s - p.up[2] * s],
    [p.centre[0] + p.right[0] * s + p.up[0] * s, p.centre[1] + p.right[1] * s + p.up[1] * s, p.centre[2] + p.right[2] * s + p.up[2] * s],
    [p.centre[0] - p.right[0] * s + p.up[0] * s, p.centre[1] - p.right[1] * s + p.up[1] * s, p.centre[2] - p.right[2] * s + p.up[2] * s],
  ];
  if (corners.some((c) => c[2] < NEAR * 4)) return null;
  return corners.map((c) => project(cam, c[0], c[1], c[2], W, H));
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
  // Inverse of [[a b c][d e f][g h 1]]
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

/**
 * Plate opacity from local photo detail G: flat areas (sky, plain walls) turn into translucent veils so
 * the glow shows through; detailed parts stay solid (Phase 4).
 */
export function plateDetailAlpha(g: number): number {
  return 0.25 + 0.75 * smoothstep(g / 0.2);
}

export interface PartsLook {
  /** Photo detail map (G of the analysis, normalised coordinates) for plateDetailAlpha. */
  detail?: { G: Float32Array; w: number; h: number };
  rings: number;
  heroSize: number;
  heroAlpha: number;
  /** Light on the plates (they sit in a dim tunnel; near heroes are lit a little more). */
  light: number;
  /** Back-lit glow along the irregular edges, in the fog colour. */
  rim: number;
  /** Back light at each pixel: the photo's light behind the plate (Phase 5); null = none. */
  rimMap: { r: Float32Array; g: Float32Array; b: Float32Array } | null;
  /** Optional per-pixel mask marking near, opaque plate interiors (for tests/diagnostics). */
  nearMask?: Uint8Array;
  /** Otherworldly recolouring per plate slot (Phase 7); null/missing = the photo's colours. */
  plateTint?: (((c: number[]) => void) | null)[];
  /** Cut-out masks per plate slot (Phase 9): the photo's object boundary instead of the rectangle. */
  masks?: ({ w: number; h: number; a: Float32Array } | null)[];
}

/** Plate sizes on screen (pixels, longest side), for the granularity criterion SC-206. */
export function projectedSizes(comp: { parts: PartsParams; camera: Camera }, W: number, H: number): number[] {
  return comp.parts.plates.map((p) => {
    const q = screenQuad(p, comp.camera, W, H, 1);
    if (!q) return 0;
    const xs = q.map((c) => c.sx);
    const ys = q.map((c) => c.sy);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  });
}

/** Painter's algorithm, far to near; each plate samples the photo through the inverse homography. */
export function renderParts(p: PartsParams, img: RgbImage, cam: Camera, layer: Layer, look: PartsLook): void {
  const { W, H } = layer;
  const plates = p.plates
    .map((pl, idx) => ({ pl, idx }))
    .filter(({ pl }) => pl.hero || pl.ring < look.rings)
    .sort((a, b) => b.pl.centre[2] - a.pl.centre[2] || a.idx - b.idx);
  const col = [0, 0, 0];
  const aspect = img.width / img.height;
  for (const { pl } of plates) {
    const sizeK = pl.hero ? look.heroSize : 1;
    const q = screenQuad(pl, cam, W, H, sizeK);
    if (!q) continue;
    const inv = inverseHomography(q);
    if (!inv) continue;
    const alphaK = pl.hero ? look.heroAlpha : 1;
    if (alphaK <= 0) continue;
    const minX = Math.max(0, Math.floor(Math.min(...q.map((c) => c.sx))));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(...q.map((c) => c.sx))));
    const minY = Math.max(0, Math.floor(Math.min(...q.map((c) => c.sy))));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(...q.map((c) => c.sy))));
    const [cu, cv, half] = pl.crop;
    const [A, B, C, D, E, F, G, Hh, I] = inv;
    const z = pl.centre[2];
    const tint = look.plateTint?.[pl.slot] ?? null;
    const mask = look.masks?.[pl.slot] ?? null;
    const lin = [0, 0, 0];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w = G * px + Hh * py + I;
        let u = (A * px + B * py + C) / w;
        let v = (D * px + E * py + F) / w;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        // Irregular, noisy edge (no straight cut), or the photo's own object outline (cut-outs).
        const edgeDist = Math.min(u, 1 - u, v, 1 - v);
        const noise = 0.06 * (Math.sin(u * 13 + pl.edge[0]) * Math.sin(v * 11 + pl.edge[1]) + 0.5 * Math.sin((u + v) * 27 + pl.edge[2]));
        if (pl.flipX) u = 1 - u;
        if (pl.flipY) v = 1 - v;
        let m = 1;
        if (mask) {
          const mx = clip(u * mask.w - 0.5, 0, mask.w - 1);
          const my = clip(v * mask.h - 0.5, 0, mask.h - 1);
          const x0 = Math.floor(mx);
          const y0 = Math.floor(my);
          const x1 = Math.min(mask.w - 1, x0 + 1);
          const y1 = Math.min(mask.h - 1, y0 + 1);
          const fx = mx - x0;
          const fy = my - y0;
          m = (mask.a[y0 * mask.w + x0] * (1 - fx) + mask.a[y0 * mask.w + x1] * fx) * (1 - fy) + (mask.a[y1 * mask.w + x0] * (1 - fx) + mask.a[y1 * mask.w + x1] * fx) * fy;
        }
        let a = (mask ? m : smoothstep((edgeDist - 0.02 - noise) / 0.07)) * alphaK;
        if (a <= 0) continue;
        const su = cu + ((u - 0.5) * 2 * half) / aspect;
        const sv = cv + (v - 0.5) * 2 * half;
        if (look.detail) a *= plateDetailAlpha(sampleMap(look.detail.G, look.detail.w, look.detail.h, su, sv));
        bilinearReflect(img, su * (img.width - 1), sv * (img.height - 1), col);
        const i = y * W + x;
        const lit = look.light * (pl.hero ? 1.3 : Math.exp(-0.09 * (z - 1.7)));
        const edgeGlow = mask ? look.rim * Math.pow(4 * m * (1 - m), 2) : look.rim * Math.pow(clip(1 - (edgeDist - noise) / 0.12, 0, 1), 2);
        const rm = look.rimMap;
        lin[0] = srgbToLinear(col[0] / 255);
        lin[1] = srgbToLinear(col[1] / 255);
        lin[2] = srgbToLinear(col[2] / 255);
        if (tint) tint(lin);
        const lr = lin[0] * lit + (rm ? rm.r[y * W + x] * edgeGlow : 0);
        const lg = lin[1] * lit + (rm ? rm.g[y * W + x] * edgeGlow : 0);
        const lb = lin[2] * lit + (rm ? rm.b[y * W + x] * edgeGlow : 0);
        layer.r[i] = layer.r[i] * (1 - a) + lr * a;
        layer.g[i] = layer.g[i] * (1 - a) + lg * a;
        layer.b[i] = layer.b[i] * (1 - a) + lb * a;
        layer.a[i] = layer.a[i] * (1 - a) + a;
        if (a > 0.5) layer.depth[i] = z;
        if (look.nearMask) look.nearMask[i] = pl.hero && a > 0.99 ? 1 : 0;
      }
    }
  }
}
