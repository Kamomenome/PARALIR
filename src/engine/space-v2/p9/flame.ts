import { fromHex, toHex } from '../../common/hash/sha256';
import { Seeded32 } from '../../common/prng/seeded32';
import { subStreamSeed } from '../../common/seed/seeds';
import { lookup, type EffectiveFeatures } from '../../common/analysis/effective';
import { mirror } from '../../common/math';
import type { Hdr } from './hdr';
import type { SpaceLayout } from './layout';
import type { SmallImage } from './photo';
import { drawsFrom } from './seeds';

/**
 * ① Non-linear IFS / Fractal Flame (flame-v1, research R-202). Points are iterated through randomly
 * chosen transforms; their density forms filaments, membranes and glow. Colours come from the photo
 * palette, start points from the photo's edges.
 */

export const VARIATIONS = [
  'linear',
  'sinusoidal',
  'spherical',
  'swirl',
  'horseshoe',
  'polar',
  'handkerchief',
  'heart',
  'disc',
  'spiral',
  'hyperbolic',
  'julia',
  'bubble',
  'eyefish',
] as const;
export type Variation = (typeof VARIATIONS)[number];

/** Variations favoured by photos with many edges (curling, organic shapes). */
const CURLY: ReadonlySet<Variation> = new Set(['swirl', 'spiral', 'julia', 'handkerchief', 'heart', 'horseshoe']);

export function applyVariation(v: Variation, x: number, y: number, u: number): [number, number] {
  const o: [number, number] = [0, 0];
  variationInto(v, x, y, u, o);
  return o;
}

/** Allocation-free variation (hot loop). θ = atan2(x, y) as in the flame convention. */
export function variationInto(v: Variation, x: number, y: number, u: number, o: [number, number]): void {
  const r2 = x * x + y * y + 1e-12;
  const r = Math.sqrt(r2);
  switch (v) {
    case 'linear':
      o[0] = x;
      o[1] = y;
      return;
    case 'sinusoidal':
      o[0] = Math.sin(x);
      o[1] = Math.sin(y);
      return;
    case 'spherical':
      o[0] = x / r2;
      o[1] = y / r2;
      return;
    case 'swirl': {
      const s = Math.sin(r2);
      const c = Math.cos(r2);
      o[0] = x * s - y * c;
      o[1] = x * c + y * s;
      return;
    }
    case 'horseshoe':
      o[0] = ((x - y) * (x + y)) / r;
      o[1] = (2 * x * y) / r;
      return;
    case 'bubble': {
      const k = 4 / (r2 + 4);
      o[0] = k * x;
      o[1] = k * y;
      return;
    }
    case 'eyefish': {
      const k = 2 / (r + 1);
      o[0] = k * x;
      o[1] = k * y;
      return;
    }
  }
  const th = Math.atan2(x, y);
  switch (v) {
    case 'polar':
      o[0] = th / Math.PI;
      o[1] = r - 1;
      return;
    case 'handkerchief':
      o[0] = r * Math.sin(th + r);
      o[1] = r * Math.cos(th - r);
      return;
    case 'heart':
      o[0] = r * Math.sin(th * r);
      o[1] = -r * Math.cos(th * r);
      return;
    case 'disc':
      o[0] = (th / Math.PI) * Math.sin(Math.PI * r);
      o[1] = (th / Math.PI) * Math.cos(Math.PI * r);
      return;
    case 'spiral':
      o[0] = (Math.cos(th) + Math.sin(r)) / r;
      o[1] = (Math.sin(th) - Math.cos(r)) / r;
      return;
    case 'hyperbolic':
      o[0] = Math.sin(th) / r;
      o[1] = r * Math.cos(th);
      return;
    case 'julia': {
      const om = u < 0.5 ? 0 : Math.PI;
      const sr = Math.sqrt(r);
      o[0] = sr * Math.cos(th / 2 + om);
      o[1] = sr * Math.sin(th / 2 + om);
      return;
    }
  }
}

export interface FlameTransform {
  affine: [number, number, number, number, number, number];
  vars: { v: Variation; w: number }[];
  color: number;
  prob: number;
}

export interface FlameParams {
  version: 'flame-v3';
  transforms: FlameTransform[];
  final: { v: Variation; w: number }[];
  /** Rotational symmetry order (1 = none); mirror adds left/right symmetry. */
  symmetry: number;
  mirror: boolean;
  /** Plane units visible from the centre to the top edge. */
  viewRadius: number;
  centre: [number, number];
  /** Where the flame's centre lands on screen (the void, in half-heights) and its rotation (the camera roll). */
  screen: [number, number];
  roll: number;
  /** Start points in plane units, one per chunk, taken from the photo's edges. */
  starts: [number, number][];
  /** Hex sub-stream seeds for the fixed set of chunks. */
  chunkSeeds: string[];
}

export const FLAME_CHUNKS = 64;
const MAX_TRANSFORMS = 5;
const TRANSFORM_DRAWS = 11;

/** Fixed draws: everything is drawn even if unused, so the count never depends on features. */
export async function buildFlame(stream: Uint8Array, e: EffectiveFeatures, L: SpaceLayout): Promise<FlameParams> {
  const g = await drawsFrom(stream, 'flame/structure', 8 + MAX_TRANSFORMS * TRANSFORM_DRAWS + 4);
  let i = 0;
  const n = 3 + Math.min(2, Math.floor(g[i++] * 2 + e.K * 1.2));
  // The symmetry follows the layout (Phase 6), so the glowing filaments share the space's order.
  const gs = g[i++];
  const gm = g[i++];
  const symmetry = L.symmetry === 'rotational' ? L.order : L.symmetry === 'mirror' ? (gs < 0.5 ? 1 : 2) : 1;
  const mirror = L.symmetry === 'mirror' || (L.symmetry === 'rotational' && gm < 0.4);
  const viewRadius = 1.1 + 0.9 * g[i++];
  const centre: [number, number] = [0, 0.15 * (g[i++] - 0.5)];
  const finalPick = g[i++];
  const finalW = 0.3 + 0.5 * g[i++];
  i++; // reserved
  const curlBoost = 1 + 4 * e.E;
  const weightOf = (v: Variation) => (CURLY.has(v) ? curlBoost : 1);
  const total = VARIATIONS.reduce((s, v) => s + weightOf(v), 0);
  const pickVar = (u: number): Variation => {
    let t = u * total;
    for (const v of VARIATIONS) {
      if (t < weightOf(v)) return v;
      t -= weightOf(v);
    }
    return VARIATIONS[VARIATIONS.length - 1];
  };
  const transforms: FlameTransform[] = [];
  for (let k = 0; k < MAX_TRANSFORMS; k++) {
    const d = g.slice(i, i + TRANSFORM_DRAWS);
    i += TRANSFORM_DRAWS;
    if (k >= n) continue;
    const ang = 2 * Math.PI * d[0];
    const s = 0.35 + 0.55 * d[1];
    const shear = 0.4 * (d[2] - 0.5);
    const a = s * Math.cos(ang);
    const b = -s * Math.sin(ang) + shear;
    const c = 1.6 * (d[3] - 0.5);
    const dd = s * Math.sin(ang);
    const ee = s * Math.cos(ang) * (0.7 + 0.6 * d[4]);
    const f = 1.6 * (d[5] - 0.5);
    const w1 = 0.45 + 0.45 * d[8];
    transforms.push({
      affine: [a, b, c, dd, ee, f],
      vars: [
        { v: pickVar(d[6]), w: w1 },
        { v: pickVar(d[7]), w: 1 - w1 },
      ],
      color: d[9],
      prob: 0.5 + d[10],
    });
  }
  const ps = transforms.reduce((s, t) => s + t.prob, 0);
  for (const t of transforms) t.prob /= ps;
  const final: FlameParams['final'] =
    finalPick < 0.35 ? [{ v: 'bubble', w: finalW }, { v: 'linear', w: 1 - finalW }] : finalPick < 0.6 ? [{ v: 'eyefish', w: finalW }, { v: 'linear', w: 1 - finalW }] : [{ v: 'linear', w: 1 }];

  // Start points on the photo's edges (weighted candidates), fixed draws per chunk.
  const sd = await drawsFrom(stream, 'flame/starts', FLAME_CHUNKS * 9);
  const starts: [number, number][] = [];
  for (let k = 0; k < FLAME_CHUNKS; k++) {
    let best: [number, number] = [0, 0];
    let bestW = -1;
    for (let c = 0; c < 4; c++) {
      const u = sd[k * 9 + c * 2];
      const v = sd[k * 9 + c * 2 + 1];
      const w = lookup(e, 'G', u, v) + 0.1 * sd[k * 9 + 8];
      if (w > bestW) {
        bestW = w;
        best = [(u - 0.5) * 2, (v - 0.5) * 2];
      }
    }
    starts.push(best);
  }
  const chunkSeeds = await Promise.all(
    Array.from({ length: FLAME_CHUNKS }, async (_, k) => toHex(await subStreamSeed(stream, `flame/chunk/${String(k).padStart(2, '0')}`))),
  );
  return { version: 'flame-v3', transforms, final, symmetry, mirror, viewRadius, centre, screen: L.voidCenter, roll: L.roll, starts, chunkSeeds };
}

/** Integer accumulation (counts and colour sums), so the merge order never changes the result. */
export class FlameAccum {
  readonly count: Float64Array;
  readonly sr: Float64Array;
  readonly sg: Float64Array;
  readonly sb: Float64Array;
  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.count = new Float64Array(W * H);
    this.sr = new Float64Array(W * H);
    this.sg = new Float64Array(W * H);
    this.sb = new Float64Array(W * H);
  }
}

const COLOR_Q = 1023;

/** Photo colours for the flame (Phase 5): the photo in linear light, pre-quantised to integers. */
export interface FlameColors {
  w: number;
  h: number;
  qr: Float64Array;
  qg: Float64Array;
  qb: Float64Array;
}

export function flameColors(photo: SmallImage): FlameColors {
  const n = photo.w * photo.h;
  const q = (ch: Float32Array) => Float64Array.from({ length: n }, (_, i) => Math.round(ch[i] * COLOR_Q));
  return { w: photo.w, h: photo.h, qr: q(photo.r), qg: q(photo.g), qb: q(photo.b) };
}

/**
 * Iterates the given chunks; points per chunk scale with the output area (quality = points per pixel).
 * Each point carries a photo pixel: across the photo by its colour coordinate, down the photo by its
 * height, so the filaments are made of the photo's colours (flame-v2).
 */
export function accumulateFlame(p: FlameParams, colors: FlameColors, acc: FlameAccum, chunks: number[], pointsPerPixel: number): void {
  const { W, H } = acc;
  const perChunk = Math.max(64, Math.round((pointsPerPixel * W * H) / FLAME_CHUNKS));
  const scale = H / 2 / p.viewRadius;
  const T = p.transforms;
  const vo: [number, number] = [0, 0];
  const { qr, qg, qb } = colors;
  const cw1 = colors.w - 1;
  const ch1 = colors.h - 1;
  const rotC = Array.from({ length: p.symmetry }, (_, k) => Math.cos((2 * Math.PI * k) / p.symmetry));
  const rotS = Array.from({ length: p.symmetry }, (_, k) => Math.sin((2 * Math.PI * k) / p.symmetry));
  const cx = W / 2 + (p.screen[0] * H) / 2;
  const cy = H / 2 + (p.screen[1] * H) / 2;
  const rc = Math.cos(p.roll);
  const rs = Math.sin(p.roll);
  for (const k of chunks) {
    const rng = new Seeded32(fromHex(p.chunkSeeds[k]));
    let [x, y] = p.starts[k];
    let c = rng.next();
    for (let it = -20; it < perChunk; it++) {
      let u = rng.next();
      let t = T[T.length - 1];
      for (const cand of T) {
        if (u < cand.prob) {
          t = cand;
          break;
        }
        u -= cand.prob;
      }
      const [a, b, cc, d, e, f] = t.affine;
      const ax = a * x + b * y + cc;
      const ay = d * x + e * y + f;
      const vu = rng.next();
      let nx = 0;
      let ny = 0;
      for (const vw of t.vars) {
        variationInto(vw.v, ax, ay, vu, vo);
        nx += vw.w * vo[0];
        ny += vw.w * vo[1];
      }
      c = (c + t.color) / 2;
      const su = rng.next();
      const mu = rng.next();
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || Math.abs(nx) > 1e6 || Math.abs(ny) > 1e6) {
        [x, y] = p.starts[k];
        continue;
      }
      x = nx;
      y = ny;
      if (it < 0) continue;
      let fx = 0;
      let fy = 0;
      for (const vw of p.final) {
        variationInto(vw.v, x, y, vu, vo);
        fx += vw.w * vo[0];
        fy += vw.w * vo[1];
      }
      // Symmetry: rotate by a random multiple of 2π/n, mirror half of the points.
      const ri = Math.floor(su * p.symmetry);
      const cr = rotC[ri];
      const sr = rotS[ri];
      let qx = cr * fx - sr * fy;
      const qy = sr * fx + cr * fy;
      if (p.mirror && mu < 0.5) qx = -qx;
      const ox = qx - p.centre[0];
      const oy = qy - p.centre[1];
      const px = Math.floor(cx + (rc * ox - rs * oy) * scale);
      const py = Math.floor(cy + (rs * ox + rc * oy) * scale);
      if (px < 0 || py < 0 || px >= W || py >= H || !Number.isFinite(qx + qy)) continue;
      const idx = py * W + px;
      const cu = Math.round(mirror(c) * cw1);
      const cv = Math.round(mirror((fy - p.centre[1]) / (2 * p.viewRadius) + 0.5) * ch1);
      const ci = cv * colors.w + cu;
      acc.count[idx] += 1;
      acc.sr[idx] += qr[ci];
      acc.sg[idx] += qg[ci];
      acc.sb[idx] += qb[ci];
    }
  }
}

/** Log-density display: filaments bright, sparse areas as faint membranes. Adds into the HDR buffer. */
export function flameToHdr(acc: FlameAccum, hdr: Hdr, brightness: number, mask?: Float32Array): void {
  const nonzero: number[] = [];
  for (let i = 0; i < acc.count.length; i += 7) if (acc.count[i] > 0) nonzero.push(acc.count[i]);
  nonzero.sort((a, b) => a - b);
  const ref = nonzero.length ? nonzero[Math.floor(0.995 * (nonzero.length - 1))] : 1;
  const norm = 1 / Math.log1p(Math.max(1, ref));
  for (let i = 0; i < acc.count.length; i++) {
    const n = acc.count[i];
    if (n === 0) continue;
    const a = Math.pow(Math.min(1.5, Math.log1p(n) * norm), 1.6) * brightness * (mask ? mask[i] : 1);
    const k = a / (n * COLOR_Q);
    hdr.r[i] += acc.sr[i] * k;
    hdr.g[i] += acc.sg[i] * k;
    hdr.b[i] += acc.sb[i] * k;
  }
}
