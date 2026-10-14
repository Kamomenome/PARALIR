import type { RgbImage } from '../../../common/image/normalize';
import type { Camera } from '../../shared/camera';
import { limbOf, type PhotoObject } from '../../shared/object';
import { newLayer, renderPlates, type Layer, type Plate } from '../../shared/plates';
import { drawsFrom } from '../../draws';
import { FIXED_LOOK, chaosOf, type SpaceControls, type Vec3 } from '../../types';

/**
 * World ① Rigid copies (FR-302): the photo's main object, never bent, repeated by one simple rule — a
 * ring around a soft light, limbs fanning around a pivot, a straight column, a lattice on a tilted plane,
 * or a spiral into depth — over the calm stage. Pure geometry in camera space (camera at the origin
 * looking along +z); independent of output size.
 */

export type CopiesKind = 'ring' | 'fan' | 'column' | 'grid' | 'spiral';
export const COPIES_KINDS: readonly CopiesKind[] = ['ring', 'fan', 'column', 'grid', 'spiral'];

export interface CopiesParams {
  kind: CopiesKind;
  count: number;
  /** Ring centre / fan pivot / column start / grid centre / spiral centre (camera space). */
  centre: Vec3;
  /** Ring radius, fan limb length, column step length, grid spacing, spiral start radius. */
  reach: number;
  objectSize: number;
  tiltX: number;
  tiltY: number;
  phase: number;
  /** Ring/spiral copies pointing out from the centre (true) or along the path. */
  radial: boolean;
  /** Fan: span and start angle. Spiral: angle step. */
  span: number;
  start: number;
  /** Column step; spiral depth step in step[2]. */
  step: Vec3;
  turn: number;
  rows: number;
  cols: number;
  ratio: number;
  /** Small per-copy turn (all zero for a perfectly regular array). */
  jitter: number[];
  limbSide: number;
  limbShare: number;
  /** For 変貌 beyond 0.5 (021 FR-2103): each copy's own scatter and turn, three values per copy. */
  scatter: number[];
}

const MAX = 24;

export async function buildCopies(stream: Uint8Array, fov: number): Promise<CopiesParams> {
  const t = Math.tan(fov / 2);
  const d = await drawsFrom(stream, 'copies/main', 16);
  const jit = await drawsFrom(stream, 'copies/jitter', MAX);
  const scatter = await drawsFrom(stream, 'copies/scatter', 3 * MAX);
  const kind = COPIES_KINDS[Math.min(4, Math.floor(d[0] * 5))];
  const jitter = jit.map((v) => (d[1] < 0.5 ? 0 : (v - 0.5) * 0.2));
  const base: CopiesParams = {
    kind, count: 0, centre: [0, 0, 4], reach: 0, objectSize: 0, tiltX: 0, tiltY: 0, phase: 0, radial: false,
    span: 0, start: 0, step: [0, 0, 0], turn: 0, rows: 0, cols: 0, ratio: 1, jitter, limbSide: 1, limbShare: 0.35, scatter,
  };
  if (kind === 'ring') {
    const z = 5 + 2 * d[2];
    const count = 8 + Math.floor(d[3] * 5);
    const reach = (0.5 + 0.25 * d[4]) * t * z;
    return { ...base, count, centre: [0, 0, z], reach, objectSize: reach * Math.sin(Math.PI / count) * (1.7 + 0.5 * d[10]),
      tiltX: (d[5] - 0.5) * 1.2, tiltY: (d[6] < 0.5 ? -1 : 1) * (0.25 + 0.5 * d[7]), phase: 2 * Math.PI * d[8], radial: d[9] < 0.4 };
  }
  if (kind === 'fan') {
    const z = 2.4 + 1.0 * d[2];
    const span = (0.9 + 0.7 * d[5]) * Math.PI;
    const side = d[11] < 0.5 ? -1 : 1;
    const objectSize = (0.55 + 0.15 * d[4]) * t * z;
    return { ...base, count: 7 + Math.floor(d[3] * 6), centre: [side * 0.2 * t * z, -0.1 * t * z, z], reach: objectSize, objectSize,
      span, start: -Math.PI / 2 - span / 2 + (d[6] - 0.5) * 0.6, limbSide: side, limbShare: 0.3 + 0.15 * d[7] };
  }
  if (kind === 'column') {
    const z = 2.0 + 0.6 * d[2];
    const a = 2 * Math.PI * d[4];
    const objectSize = (0.42 + 0.15 * d[5]) * t * z;
    const stepLen = objectSize * (1.0 + 0.6 * d[6]);
    return { ...base, count: 5 + Math.floor(d[3] * 4), centre: [-Math.cos(a) * 0.3 * t * z, -Math.sin(a) * 0.3 * t * z, z], reach: stepLen, objectSize,
      step: [Math.cos(a) * stepLen * 0.6, Math.sin(a) * stepLen * 0.6, stepLen * (0.8 + 1.2 * d[7])], turn: (d[8] - 0.5) * 1.0 };
  }
  if (kind === 'grid') {
    const z = 4.5 + 2 * d[2];
    const rows = 3 + Math.floor(d[3] * 2);
    const cols = 3 + Math.floor(d[4] * 3);
    const objectSize = ((1.0 + 0.4 * d[5]) * t * z) / Math.max(rows, cols);
    return { ...base, count: rows * cols, rows, cols, centre: [(d[6] - 0.5) * 0.4 * t * z, (d[7] - 0.5) * 0.3 * t * z, z], reach: objectSize * (2.1 + 0.4 * d[8]), objectSize,
      tiltX: (d[9] - 0.5) * 1.2, tiltY: (d[10] - 0.5) * 1.6, phase: (d[11] - 0.5) * 0.4 };
  }
  const z = 2.0 + 0.6 * d[2];
  return { ...base, count: 8 + Math.floor(d[3] * 6), centre: [0, 0, z], reach: (0.7 + 0.2 * d[6]) * t * z, objectSize: (0.32 + 0.1 * d[5]) * t * z,
    phase: 2 * Math.PI * d[7], radial: d[8] < 0.5, span: (d[9] < 0.5 ? -1 : 1) * (0.5 + 0.35 * d[10]), step: [0, 0, (0.35 + 0.5 * d[11]) * z * 0.25], ratio: 0.82 + 0.1 * d[4] };
}

const rotX = (v: Vec3, a: number): Vec3 => [v[0], Math.cos(a) * v[1] - Math.sin(a) * v[2], Math.sin(a) * v[1] + Math.cos(a) * v[2]];
const rotY = (v: Vec3, a: number): Vec3 => [Math.cos(a) * v[0] + Math.sin(a) * v[2], v[1], -Math.sin(a) * v[0] + Math.cos(a) * v[2]];
const rotZ = (v: Vec3, a: number): Vec3 => [Math.cos(a) * v[0] - Math.sin(a) * v[1], Math.sin(a) * v[0] + Math.cos(a) * v[1], v[2]];
const mix = (a: Vec3, b: Vec3, ca: number, cb: number): Vec3 => [ca * a[0] + cb * b[0], ca * a[1] + cb * b[1], ca * a[2] + cb * b[2]];

export interface CopyInstance {
  role: 'body' | 'copy';
  index: number;
  centre: Vec3;
  right: Vec3;
  up: Vec3;
  size: number;
}

/**
 * Every placed copy (and the fan's body), scaled by `sizeK`. `chaos` (変貌 beyond 0.5, 021 FR-2103): more copies, each
 * thrown off its place and turned by its own scatter; 0 is the regular array.
 */
export function copyInstances(q: CopiesParams, sizeK = 1, chaos = 0): CopyInstance[] {
  const p = chaos > 0 && q.kind !== 'grid' ? { ...q, count: Math.min(MAX, q.count + Math.round(12 * chaos)) } : q;
  const out: CopyInstance[] = [];
  const C = p.centre;
  const s = p.objectSize * sizeK;
  if (p.kind === 'ring') {
    const e1 = rotY(rotX([1, 0, 0], p.tiltX), p.tiltY);
    const e2 = rotY(rotX([0, 1, 0], p.tiltX), p.tiltY);
    for (let k = 0; k < p.count; k++) {
      const th = p.phase + (2 * Math.PI * k) / p.count;
      const radialV = mix(e1, e2, Math.cos(th), Math.sin(th));
      const tangent = mix(e1, e2, -Math.sin(th), Math.cos(th));
      const up0 = p.radial ? radialV : tangent;
      const right0: Vec3 = p.radial ? tangent : [-radialV[0], -radialV[1], -radialV[2]];
      const j = p.jitter[k];
      out.push({ role: 'copy', index: k, centre: mix(C, radialV, 1, p.reach), right: mix(right0, up0, Math.cos(j), -Math.sin(j)), up: mix(up0, right0, Math.cos(j), Math.sin(j)), size: s });
    }
  } else if (p.kind === 'fan') {
    out.push({ role: 'body', index: 0, centre: [C[0], C[1] + s * 0.15, C[2] + 0.01], right: [1, 0, 0], up: [0, 1, 0], size: s });
    const limb = s * 0.9;
    for (let k = 0; k < p.count; k++) {
      const a = p.start + (p.span * k) / Math.max(1, p.count - 1) + p.jitter[k] * 0.5;
      const up: Vec3 = [Math.cos(a), Math.sin(a), 0];
      // The limb's inner end is the pivot.
      out.push({ role: 'copy', index: k, centre: mix(C, up, 1, limb), right: [-Math.sin(a), Math.cos(a), 0], up, size: limb });
    }
  } else if (p.kind === 'column') {
    for (let k = 0; k < p.count; k++) {
      const a = p.turn * k + p.jitter[k];
      out.push({ role: 'copy', index: k, centre: mix(C, p.step, 1, k), right: rotZ([1, 0, 0], a), up: rotZ([0, 1, 0], a), size: s });
    }
  } else if (p.kind === 'grid') {
    const e1 = rotY(rotX([1, 0, 0], p.tiltX), p.tiltY);
    const e2 = rotY(rotX([0, 1, 0], p.tiltX), p.tiltY);
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        const k = r * p.cols + c;
        const a = p.phase + p.jitter[k];
        const pos = mix(mix(C, e1, 1, (c - (p.cols - 1) / 2) * p.reach), e2, 1, (r - (p.rows - 1) / 2) * p.reach);
        out.push({ role: 'copy', index: k, centre: pos, right: mix(e1, e2, Math.cos(a), Math.sin(a)), up: mix(e1, e2, -Math.sin(a), Math.cos(a)), size: s });
      }
    }
  } else {
    for (let k = 0; k < p.count; k++) {
      const th = p.phase + p.span * k;
      const r = p.reach * Math.pow(p.ratio, k);
      const radialV: Vec3 = [Math.cos(th), Math.sin(th), 0];
      const tangent: Vec3 = [-Math.sin(th), Math.cos(th), 0];
      out.push({ role: 'copy', index: k, centre: [C[0] + r * radialV[0], C[1] + r * radialV[1], C[2] + p.step[2] * k], right: p.radial ? tangent : [-radialV[0], -radialV[1], 0], up: p.radial ? radialV : tangent, size: s });
    }
  }
  return chaos > 0 ? out.map((c, n) => scattered(c, p, n, chaos)) : out;
}

/** A copy thrown off its place (up to two of its sizes, and in depth) and turned (up to 2.5 rad) by its own scatter. */
function scattered(c: CopyInstance, p: CopiesParams, n: number, chaos: number): CopyInstance {
  const [a, b, d] = [0, 1, 2].map((j) => 2 * (p.scatter[(3 * n + j) % p.scatter.length] - 0.5));
  const turn = 2.5 * chaos * a;
  const reach = 2 * chaos * c.size;
  return {
    ...c,
    centre: [c.centre[0] + reach * b, c.centre[1] + reach * d, c.centre[2] + 0.5 * reach * a],
    right: mix(c.right, c.up, Math.cos(turn), Math.sin(turn)),
    up: mix(c.up, c.right, Math.cos(turn), -Math.sin(turn)),
  };
}

/** The copies as a layer of photo plates (linear colour, coverage, depth). */
export function copiesLayer(p: CopiesParams, obj: PhotoObject, img: RgbImage, cam: Camera, c: SpaceControls, W: number, H: number): Layer {
  const limb = p.kind === 'fan' ? limbOf(obj, img, p.limbSide, p.limbShare) : null;
  const plates: Plate[] = copyInstances(p, 0.7 + 0.6 * FIXED_LOOK.size, chaosOf(c)).map((i) => {
    const part = i.role === 'copy' && limb ? limb : obj;
    return { crop: part.crop, centre: i.centre, size: i.size, right: i.right, up: i.up, mask: part.mask, edge: [0, 0, 0] };
  });
  const layer = newLayer(W, H);
  renderPlates(plates, img, cam, layer);
  return layer;
}
