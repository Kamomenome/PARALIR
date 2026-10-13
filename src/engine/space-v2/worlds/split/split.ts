import type { RgbImage } from '../../../common/image/normalize';
import { smoothstep } from '../../../common/math';
import type { Camera } from '../../shared/camera';
import type { PhotoObject } from '../../shared/object';
import { newLayer, renderPlates, type Layer, type Mask, type Plate } from '../../shared/plates';
import { drawsFrom } from '../../draws';
import type { SpaceControls, Vec3 } from '../../types';

/**
 * World ④ The subject split, rebuilt and overlapped (003 FR-305; from 002 Phase 13, R-214): like splitting a stump,
 * the subject's box is cut by straight lines into convex pieces; the pieces are put back near where they
 * were, apart, slightly turned and at different depths; and the rebuilt subject is repeated several times,
 * each copy stepped by the same translation, turn and scale (a pattern), or with some pieces leaving the
 * pattern at random. Everything here is in subject-box units (box height = 1) and is size-independent.
 */

export interface Cut {
  /** Direction of the cut's normal (radians) and where across the piece it falls (0..1). */
  angle: number;
  at: number;
  /** Which piece is split (by area-weighted choice). */
  pick: number;
}

export interface FragmentParams {
  cuts: Cut[];
  pieces: number;
  explode: number;
  spin: number[];
  lift: number[];
  copies: number;
  step: { dx: number; dy: number; dz: number; rot: number; scale: number };
  mode: 'pattern' | 'random';
  jitterShare: number;
  jitter: number[];
  /** Which side of the void the subject stands on, and its depth. */
  side: number;
  z0: number;
}

const MAX_PIECES = 8;
const MAX_COPIES = 7;

/** Fixed draws, whatever the photo. */
export async function buildSplit(stream: Uint8Array): Promise<FragmentParams> {
  const d = await drawsFrom(stream, 'split/main', 3 * (MAX_PIECES - 1) + 2 * MAX_PIECES + 12);
  let i = 0;
  const cuts: Cut[] = [];
  for (let c = 0; c < MAX_PIECES - 1; c++) cuts.push({ angle: Math.PI * d[i++], at: 0.3 + 0.4 * d[i++], pick: d[i++] });
  const spin: number[] = [];
  const lift: number[] = [];
  for (let k = 0; k < MAX_PIECES; k++) {
    spin.push((d[i++] - 0.5) * 0.5);
    lift.push((d[i++] - 0.5) * 0.6);
  }
  const pieces = 4 + Math.min(MAX_PIECES - 4, Math.floor(d[i++] * (MAX_PIECES - 3)));
  const explode = 0.12 + 0.33 * d[i++];
  const copies = 4 + Math.min(MAX_COPIES - 4, Math.floor(d[i++] * (MAX_COPIES - 3)));
  const dir = 2 * Math.PI * d[i++];
  const len = 0.12 + 0.25 * d[i++];
  const step = { dx: len * Math.cos(dir), dy: len * Math.sin(dir), dz: (d[i++] - 0.3) * 0.5, rot: (d[i++] - 0.5) * 0.3, scale: 0.9 + 0.2 * d[i++] };
  const mode: FragmentParams['mode'] = d[i++] < 0.5 ? 'pattern' : 'random';
  const jitterShare = 0.25 + 0.25 * d[i++];
  const side = d[i++] < 0.5 ? -1 : 1;
  const z0 = 2.0 + 0.6 * d[i++];
  const jitter = await drawsFrom(stream, 'split/jitter', MAX_PIECES * MAX_COPIES * 4);
  return { cuts, pieces, explode, spin, lift, copies, step, mode, jitterShare, jitter, side, z0 };
}

type Poly = [number, number][];

const polyArea = (p: Poly) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    s += x0 * y1 - x1 * y0;
  }
  return Math.abs(s) / 2;
};

/** Keeps the part of a convex polygon where n·x ≤ c (Sutherland–Hodgman for one half-plane). */
function clipHalf(p: Poly, nx: number, ny: number, c: number): Poly {
  const out: Poly = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const da = nx * a[0] + ny * a[1] - c;
    const db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/** The subject's box [0,1]² split by straight cuts into convex pieces (they tile the box exactly). */
export function splitPieces(p: FragmentParams): Poly[] {
  let pieces: Poly[] = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ];
  for (let c = 0; pieces.length < p.pieces; c++) {
    const cut = p.cuts[c];
    // Area-weighted choice of the piece to split (large pieces split more often; small splinters remain).
    const areas = pieces.map(polyArea);
    const total = areas.reduce((s, a) => s + a, 0);
    let t = cut.pick * total;
    let k = pieces.length - 1;
    for (let j = 0; j < pieces.length; j++) {
      if (t < areas[j]) {
        k = j;
        break;
      }
      t -= areas[j];
    }
    const nx = Math.cos(cut.angle);
    const ny = Math.sin(cut.angle);
    const proj = pieces[k].map((q) => nx * q[0] + ny * q[1]);
    const lo = Math.min(...proj);
    const hi = Math.max(...proj);
    const cc = lo + cut.at * (hi - lo);
    const a = clipHalf(pieces[k], nx, ny, cc);
    const b = clipHalf(pieces[k], -nx, -ny, -cc);
    pieces = [...pieces.slice(0, k), a, b, ...pieces.slice(k + 1)];
  }
  return pieces;
}

export interface FragmentPlacement {
  piece: number;
  copy: number;
  /** Rebuilt position of the piece's centre (relative to the box centre, box units), before the copies' steps. */
  base: [number, number];
  /** Position after the pattern's steps, and the random offset added on top (zero unless jittered). */
  pattern: [number, number];
  jit: [number, number, number];
  jittered: boolean;
  /** Turn (pattern only), scale and depth offset of this copy, and its opacity. */
  rot: number;
  scale: number;
  dz: number;
  alpha: number;
}

const centroid = (p: Poly): [number, number] => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

/** Where every piece of every copy goes (box units relative to the box centre). */
export function fragmentLayout(p: FragmentParams, pieces: Poly[]): FragmentPlacement[] {
  const out: FragmentPlacement[] = [];
  const pairs = pieces.length * (p.copies - 1);
  // Which (piece, copy ≥ 1) pairs leave the pattern in the random mode: some, never none or all.
  const jitterOn = new Array<boolean>(pairs).fill(false);
  if (p.mode === 'random') {
    for (let q = 0; q < pairs; q++) jitterOn[q] = p.jitter[q * 4] < p.jitterShare;
    const n = jitterOn.filter(Boolean).length;
    if (n === 0) jitterOn[0] = true;
    if (n === pairs) jitterOn[pairs - 1] = false;
  }
  for (let k = 0; k < pieces.length; k++) {
    const [cx, cy] = centroid(pieces[k]);
    const ox = cx - 0.5;
    const oy = cy - 0.5;
    const r = Math.hypot(ox, oy);
    const ux = r > 1e-9 ? ox / r : 1;
    const uy = r > 1e-9 ? oy / r : 0;
    // Rebuilt: pushed outwards from the centre (gaps between pieces), as when a stump falls apart.
    const base: [number, number] = [ox * (1 + p.explode) + ux * 0.05 * p.explode, oy * (1 + p.explode) + uy * 0.05 * p.explode];
    for (let j = 0; j < p.copies; j++) {
      const q = j === 0 ? -1 : k * (p.copies - 1) + (j - 1);
      const on = q >= 0 && jitterOn[q];
      const jit: [number, number, number] = on ? [(p.jitter[q * 4 + 1] - 0.5) * 0.4, (p.jitter[q * 4 + 2] - 0.5) * 0.4, (p.jitter[q * 4 + 3] - 0.5) * 0.6] : [0, 0, 0];
      out.push({
        piece: k,
        copy: j,
        base,
        pattern: [base[0] + j * p.step.dx, base[1] + j * p.step.dy],
        jit,
        jittered: on,
        rot: p.spin[k] + j * p.step.rot,
        scale: Math.pow(p.step.scale, j),
        dz: p.lift[k] + j * p.step.dz,
        alpha: 1 - (0.45 * j) / p.copies,
      });
    }
  }
  return out;
}

/** Inside a convex polygon, softened by `soft` (polygon units) at its straight edges. */
function polyCoverage(poly: [number, number][], x: number, y: number, soft: number): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    area += ax * by - bx * ay;
  }
  const orient = area >= 0 ? 1 : -1;
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    m = Math.min(m, (orient * ((bx - ax) * (y - ay) - (by - ay) * (x - ax))) / l);
  }
  return smoothstep(m / soft + 0.5);
}

/**
 * Each piece of each copy is a flat photo plate (straight edges stay straight), masked by its polygon and
 * the object's outline (a layer, merged over the background by the world).
 */
export function splitLayer(p: FragmentParams, obj: PhotoObject, img: RgbImage, cam: Camera, c: SpaceControls, W: number, H: number): Layer {
  const aspect = img.width / img.height;
  const [u0, v0, u1, v1] = obj.box;
  const bw = (u1 - u0) * aspect;
  const bh = v1 - v0;
  const side = Math.max(bw, bh) * 1.05;
  const half = side / 2;
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const tanHalf = Math.tan(cam.fov / 2);
  // World units per photo height: the object stands about (0.9..1.3) × half the screen height tall.
  const k = ((0.9 + 0.4 * c.size) * tanHalf * p.z0) / Math.max(bh, 0.05);
  const centre: [number, number] = [p.side * 0.25 * tanHalf * p.z0, 0];
  const pieces = splitPieces(p);
  // The object's own mask, read through the square crop around its box.
  const [ocu, ocv, ohalf] = obj.crop;
  const inObj = (su: number, sv: number) => {
    const m = obj.mask;
    const mu = 0.5 + ((su - ocu) * aspect) / (2 * ohalf);
    const mv = 0.5 + (sv - ocv) / (2 * ohalf);
    if (mu < 0 || mu > 1 || mv < 0 || mv > 1) return 0;
    return m.a[Math.min(m.h - 1, Math.floor(mv * m.h)) * m.w + Math.min(m.w - 1, Math.floor(mu * m.w))];
  };
  const res = 96;
  const masks: Mask[] = pieces.map((poly) => {
    const a = new Float32Array(res * res);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const cx = (x + 0.5) / res;
        const cy = (y + 0.5) / res;
        const bx = 0.5 + ((cx - 0.5) * side) / bw;
        const by = 0.5 + ((cy - 0.5) * side) / bh;
        a[y * res + x] = polyCoverage(poly, bx, by, 1.5 / res) * inObj(cu + ((cx - 0.5) * side) / aspect, cv + (cy - 0.5) * side);
      }
    }
    return { w: res, h: res, a };
  });
  const plates: Plate[] = [];
  for (const e of fragmentLayout(p, pieces)) {
    const poly = pieces[e.piece];
    const pc = [poly.reduce((s, q) => s + q[0], 0) / poly.length, poly.reduce((s, q) => s + q[1], 0) / poly.length];
    const ox = ((pc[0] - 0.5) * bw) / side;
    const oy = ((pc[1] - 0.5) * bh) / side;
    const rot = e.rot + e.jit[2];
    const right: Vec3 = [Math.cos(rot), Math.sin(rot), 0];
    const up: Vec3 = [-Math.sin(rot), Math.cos(rot), 0];
    const size = half * k * e.scale;
    const px = centre[0] + (e.pattern[0] + e.jit[0]) * bh * k;
    const py = centre[1] + (e.pattern[1] + e.jit[1]) * bh * k;
    plates.push({
      crop: [cu, cv, half],
      centre: [px - (right[0] * ox + up[0] * oy) * 2 * size, py - (right[1] * ox + up[1] * oy) * 2 * size, p.z0 + e.dz],
      size,
      right,
      up,
      mask: masks[e.piece],
      edge: [0, 0, 0],
      alpha: e.alpha,
    });
  }
  const layer = newLayer(W, H);
  renderPlates(plates, img, cam, layer);
  return layer;
}
