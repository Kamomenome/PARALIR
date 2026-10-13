import type { RgbImage } from '../../../common/image/normalize';
import { smoothstep } from '../../../common/math';
import type { Camera } from '../../shared/camera';
import { hash01, newRgb, type Rgb3 } from '../../shared/color';
import type { PhotoObject } from '../../shared/object';
import { lightColours, lightMap } from '../../shared/photo';
import { newLayer, renderPlates, type Layer, type Plate } from '../../shared/plates';
import { drawsFrom } from '../../draws';
import type { SpaceControls, Vec3 } from '../../types';

/**
 * World ② Darkness and light (FR-303, research R-303): copies of the photo's object float in near-black
 * darkness at every depth, lit only where the light reaches them — (a) a beam falling at a slant from
 * above, made of rays read from a row of the photo's light, in the photo's light colours; (b) a flock of
 * hundreds of small copies flowing as one shape, lit from one side. Screen positions are fractions of the
 * frame and depths are world units, so the world does not depend on the output size.
 */

export type DarkKind = 'beam' | 'flock';
export const DARK_KINDS: readonly DarkKind[] = ['beam', 'flock'];

export interface DarkParams {
  kind: DarkKind;
  /** Beam: source and aim (fractions of width / height), half-angle, photo row for the rays. */
  source: [number, number];
  aim: [number, number];
  half: number;
  row: number;
  /** Flock: quadratic curve (half-heights from the centre); lamp = [position along the curve, offset below it (half-heights)]. */
  curve: [[number, number], [number, number], [number, number]];
  lamp: [number, number];
  /** Raw per-object draws (fixed count), turned into placements at render time. */
  objects: number[][];
}

const MAX_BEAM = 90;
const MAX_FLOCK = 420;
const PER = 8;

export async function buildDark(stream: Uint8Array): Promise<DarkParams> {
  const d = await drawsFrom(stream, 'dark/main', 12);
  const kind: DarkKind = d[0] < 0.5 ? 'beam' : 'flock';
  const raw = await drawsFrom(stream, 'dark/objects', MAX_FLOCK * PER);
  const objects = Array.from({ length: MAX_FLOCK }, (_, k) => raw.slice(k * PER, (k + 1) * PER));
  return {
    kind,
    source: [0.45 + 0.3 * d[1], -0.08],
    aim: [0.2 + 0.4 * d[2], 1.15],
    half: 0.16 + 0.08 * d[3],
    row: 0.15 + 0.5 * d[4],
    curve: [
      [-1.1, 0.45 + 0.2 * (d[5] - 0.5)],
      [(d[6] - 0.5) * 1.2, -0.9 + 0.4 * d[7]],
      [1.1, 0.1 + 0.4 * (d[8] - 0.5)],
    ],
    // The lamp stands just below one end of the flock (fraction along the curve, offset below it).
    lamp: [d[9] < 0.5 ? 0.04 + 0.16 * d[10] : 0.8 + 0.16 * d[10], 0.25],
    objects,
  };
}

const rotate = (v: Vec3, rx: number, ry: number, rz: number): Vec3 => {
  let [x, y, z] = v;
  [y, z] = [Math.cos(rx) * y - Math.sin(rx) * z, Math.sin(rx) * y + Math.cos(rx) * z];
  [x, z] = [Math.cos(ry) * x + Math.sin(ry) * z, -Math.sin(ry) * x + Math.cos(ry) * z];
  [x, y] = [Math.cos(rz) * x - Math.sin(rz) * y, Math.sin(rz) * x + Math.cos(rz) * y];
  return [x, y, z];
};

/** Number of objects drawn for the slider value (the first ones of the fixed list, so they stay put). */
export function darkCount(p: DarkParams, count: number): number {
  return Math.round((p.kind === 'beam' ? MAX_BEAM : MAX_FLOCK) * (0.35 + 0.65 * count));
}

/** Placements of the objects for a frame (camera space; screen fractions → world at each depth). */
export function darkPlacements(p: DarkParams, cam: Camera, W: number, H: number, c: SpaceControls): { centre: Vec3; right: Vec3; up: Vec3; size: number }[] {
  const t = Math.tan(cam.fov / 2);
  const n = darkCount(p, c.count);
  const sizeK = 0.7 + 0.6 * c.size;
  const out: { centre: Vec3; right: Vec3; up: Vec3; size: number }[] = [];
  const toWorld = (px: number, py: number, z: number): Vec3 => [((px - W / 2) / (H / 2)) * t * z, ((py - H / 2) / (H / 2)) * t * z, z];
  if (p.kind === 'beam') {
    const sx = p.source[0] * W;
    const sy = p.source[1] * H;
    const ax = p.aim[0] * W - sx;
    const ay = p.aim[1] * H - sy;
    const al = Math.hypot(ax, ay);
    for (let k = 0; k < n; k++) {
      const q = p.objects[k];
      const z = 1.3 * Math.pow(10, q[3]);
      let px: number;
      let py: number;
      if (q[0] < 0.75) {
        // Most objects hang in the beam: along its axis, within its cone.
        const tt = 0.15 + 0.85 * q[1];
        const off = (q[2] - 0.5) * 2 * p.half * 0.8 * tt * al;
        px = sx + ax * tt - (ay / al) * off;
        py = sy + ay * tt + (ax / al) * off;
      } else {
        px = q[1] * W;
        py = q[2] * H;
      }
      out.push({ centre: toWorld(px, py, z), right: rotate([1, 0, 0], 6.3 * q[5], 6.3 * q[6], 6.3 * q[7]), up: rotate([0, 1, 0], 6.3 * q[5], 6.3 * q[6], 6.3 * q[7]), size: (0.07 + 0.1 * q[4]) * t * z * sizeK });
    }
  } else {
    const [p0, p1, p2] = p.curve;
    for (let k = 0; k < n; k++) {
      const q = p.objects[k];
      const tt = q[0];
      const bx = (1 - tt) * (1 - tt) * p0[0] + 2 * tt * (1 - tt) * p1[0] + tt * tt * p2[0];
      const by = (1 - tt) * (1 - tt) * p0[1] + 2 * tt * (1 - tt) * p1[1] + tt * tt * p2[1];
      const tx = 2 * (1 - tt) * (p1[0] - p0[0]) + 2 * tt * (p2[0] - p1[0]);
      const ty = 2 * (1 - tt) * (p1[1] - p0[1]) + 2 * tt * (p2[1] - p1[1]);
      const tl = Math.hypot(tx, ty) || 1;
      // Across the band: a soft (triangular-ish) spread, wider in the middle of the flock.
      const nrm = (q[1] + q[2] + q[3] - 1.5) * (0.12 + 0.3 * Math.sin(Math.PI * tt));
      const z = 4 + 2.5 * (q[4] - 0.5);
      const x = (bx - (ty / tl) * nrm) * t * z;
      const y = (by + (tx / tl) * nrm) * t * z;
      const along = Math.atan2(ty, tx) + (q[7] - 0.5) * 0.6;
      out.push({ centre: [x, y, z], right: rotate([1, 0, 0], (q[5] - 0.5) * 0.8, (q[6] - 0.5) * 0.8, along), up: rotate([0, 1, 0], (q[5] - 0.5) * 0.8, (q[6] - 0.5) * 0.8, along), size: 0.055 * t * z * sizeK });
    }
  }
  return out;
}

/** The light at a pixel (linear colour). */
export function darkLight(p: DarkParams, img: RgbImage, W: number, H: number, gain: number): (x: number, y: number) => number[] {
  const [main, second] = lightColours(img);
  if (p.kind === 'flock') {
    const [p0, p1, p2] = p.curve;
    const t = p.lamp[0];
    const bx = (1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0];
    const by = (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1] + p.lamp[1];
    const lx = W / 2 + (bx * H) / 2;
    const ly = H / 2 + (by * H) / 2;
    return (x, y) => {
      // One lamp: the near side of the flock glares, the far side sinks into the dark.
      const k = gain * 3.0 * Math.exp(-Math.hypot(x - lx, y - ly) / H / 0.22);
      return [main[0] * k, main[1] * k, main[2] * k];
    };
  }
  const lm = lightMap(img);
  const sx = p.source[0] * W;
  const sy = p.source[1] * H;
  const ax = p.aim[0] * W - sx;
  const ay = p.aim[1] * H - sy;
  const al = Math.hypot(ax, ay);
  const rowStart = Math.floor(p.row * (lm.h - 1)) * lm.w;
  // Rays: the photo's light along one of its rows, read across the beam (light through a window of the photo).
  let rowMax = 1e-9;
  for (let k = 0; k < lm.w; k++) rowMax = Math.max(rowMax, (lm.r[rowStart + k] + lm.g[rowStart + k] + lm.b[rowStart + k]) / 3);
  const rays = (t: number) => {
    const u = Math.min(1, Math.max(0, 0.5 + t * 0.35)) * (lm.w - 1);
    const i = rowStart + Math.floor(u);
    return Math.pow((lm.r[i] + lm.g[i] + lm.b[i]) / 3 / rowMax, 1.5);
  };
  return (x, y) => {
    const dx = x - sx;
    const dy = y - sy;
    const d = Math.hypot(dx, dy);
    const cross = (dx * ay - dy * ax) / (al * Math.max(d, 1));
    const t = Math.asin(Math.max(-1, Math.min(1, cross))) / p.half;
    const inside = 1 - smoothstep((Math.abs(t) - 0.45) / 0.7);
    const fall = Math.exp(-d / (1.1 * H));
    const edge = smoothstep((Math.abs(t) - 0.3) / 0.6);
    // A bright core along the axis, rays across it from the photo's light.
    const core = (1 - Math.min(1, Math.abs(t))) ** 2;
    // Where the light enters, it is near white-hot.
    const k = 1.8 * gain * inside * (fall * (0.3 + 2.4 * core * core) * (0.2 + 1.0 * rays(t)) + 1.6 * core * Math.exp(-d / (0.3 * H)));
    return [0, 1, 2].map((q) => (main[q] * (1 - edge) + second[q] * edge) * k);
  };
}

/**
 * The objects lit by the beam or the lamp (a layer: lit colour, coverage, depth) and the light in the air
 * (the visible beam), to be added over the background.
 */
export function darkLayer(p: DarkParams, obj: PhotoObject, img: RgbImage, cam: Camera, c: SpaceControls, W: number, H: number): { layer: Layer; air: Rgb3 } {
  const plates: Plate[] = darkPlacements(p, cam, W, H, c).map((o) => ({ crop: obj.crop, centre: o.centre, size: o.size, right: o.right, up: o.up, mask: obj.mask, edge: [0, 0, 0] }));
  const layer = newLayer(W, H);
  renderPlates(plates, img, cam, layer);
  const light = darkLight(p, img, W, H, 0.6 + 0.8 * c.light);
  const air = newRgb(W * H);
  const airK = p.kind === 'beam' ? 0.45 : 0.004;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const L = light(x + 0.5, y + 0.5);
      const lit = Math.max(L[0], L[1], L[2]);
      // Objects are lit where the light reaches them and stay dark silhouettes elsewhere; the air shows the beam.
      const k = (p.kind === 'beam' ? 0.025 : 0.01) + (p.kind === 'beam' ? 3.2 : 1.6) * lit;
      layer.r[i] *= k;
      layer.g[i] *= k;
      layer.b[i] *= k;
      const grain = 0.92 + 0.16 * hash01(i);
      air.r[i] = airK * L[0] * grain;
      air.g[i] = airK * L[1] * grain;
      air.b[i] = airK * L[2] * grain;
    }
  }
  return { layer, air };
}
