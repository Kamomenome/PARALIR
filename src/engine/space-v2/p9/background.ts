import type { RgbImage } from '../../common/image/normalize';
import { clip, mirror, smoothstep } from '../../common/math';
import { lookup, type EffectiveFeatures } from '../../common/analysis/effective';
import type { Camera } from './camera';
import { blurChannel } from './hdr';
import { linearSmall, photoSampler, sampleSmall, type SmallImage } from './photo';
import { drawsFrom } from './seeds';

/**
 * Phase 8: the world is made in three parts — a background, a foreground and a merge — each its own
 * algorithm, chosen by the seed (and fixable on screen). Every background is made of the photo's pixels.
 *
 * - light: the photo's light arranged around the void, textured by the flame (Phases 4–6).
 * - sphere: the photo wrapped onto a celestial sphere around the viewer; seen along its pole it becomes
 *   a polar tunnel, seen across it a horizon — upright, upside down, mirrored at the horizon or inside out.
 * - droste: the photo inside itself, again and again, around a point of the photo (optionally as an
 *   Escher-like spiral), receding into the void.
 */
export const BACKGROUNDS = ['light', 'sphere', 'droste'] as const;
export type BackgroundAlgo = (typeof BACKGROUNDS)[number];
/** Phase 9: foregrounds whose shapes come only from the photo; 'structures' (with grown branches) only on screen. */
export const SEEDED_FOREGROUNDS = ['plates', 'cutouts', 'contours', 'surface', 'kaleidoscope', 'rorschach'] as const;
export const FOREGROUNDS = [...SEEDED_FOREGROUNDS, 'structures'] as const;
export type ForegroundAlgo = (typeof FOREGROUNDS)[number];
/** depth: structures over the background with depth fog; otherworld: the same, but background and structures live by different colour rules. */
export const MERGES = ['depth', 'otherworld'] as const;
export type MergeAlgo = (typeof MERGES)[number];

export interface SpacePipeline {
  background: BackgroundAlgo;
  foreground: ForegroundAlgo;
  merge: MergeAlgo;
}

/** What the screen holds for each part: 'auto' = the seed's choice. */
export interface PipelineChoice {
  background: BackgroundAlgo | 'auto';
  foreground: ForegroundAlgo | 'auto';
  merge: MergeAlgo | 'auto';
}

export const AUTO_PIPELINE: PipelineChoice = Object.freeze({ background: 'auto', foreground: 'auto', merge: 'auto' });

/** The parts fixed on screen (the rest follows the seed). */
export function pipelineOverrides(c: PipelineChoice): Partial<SpacePipeline> {
  const o: Partial<SpacePipeline> = {};
  if (c.background !== 'auto') o.background = c.background;
  if (c.foreground !== 'auto') o.foreground = c.foreground;
  if (c.merge !== 'auto') o.merge = c.merge;
  return o;
}

export async function buildPipeline(stream: Uint8Array): Promise<SpacePipeline> {
  const d = await drawsFrom(stream, 'pipeline/main', 3);
  const background: BackgroundAlgo = d[0] < 0.4 ? 'light' : d[0] < 0.7 ? 'sphere' : 'droste';
  const merge: MergeAlgo = d[2] < 0.6 ? 'depth' : 'otherworld';
  const foreground: ForegroundAlgo = SEEDED_FOREGROUNDS[Math.min(SEEDED_FOREGROUNDS.length - 1, Math.floor(d[1] * SEEDED_FOREGROUNDS.length))];
  return { background, foreground, merge };
}

export type SphereMode = 'upright' | 'inverted' | 'reflected' | 'insideOut';

export interface SphereParams {
  /** Tilt of the sphere's pole away from the horizon towards the view axis (π/2 = looking into the pole). */
  tilt: number;
  yaw: number;
  mode: SphereMode;
  /** Photo copies around the sphere (each mirrored against its neighbour, so there is no seam). */
  reps: number;
  /** Photo row on the horizon. */
  horizon: number;
}

export interface DrosteParams {
  /** Fixed point of the recursion in photo units (x in photo heights, y in heights). */
  fixed: [number, number];
  /** Each copy is this much smaller than the one around it. */
  scale: number;
  /** -1 / 0 / 1: Escher-like spiral (the copies wind into each other) or straight nesting. */
  spiral: number;
  /** Extra rotation of each nested copy. */
  turn: number;
  /** Photo heights per half-height of the screen at the outermost level. */
  zoom: number;
  aspect: number;
}

export interface BackgroundParams {
  sphere: SphereParams;
  droste: DrosteParams;
}

/** Fixed draws for every background, whichever is used. */
export async function buildBackgrounds(stream: Uint8Array, e: EffectiveFeatures, aspect: number): Promise<BackgroundParams> {
  const s = await drawsFrom(stream, 'background/sphere', 6);
  const tiltKind = s[0];
  const tilt = tiltKind < 0.45 ? Math.PI / 2 : tiltKind < 0.75 ? 0 : (0.2 + 0.25 * s[1]) * Math.PI;
  const modes: SphereMode[] = ['upright', 'inverted', 'reflected', 'insideOut'];
  const sphere: SphereParams = {
    tilt,
    yaw: 2 * Math.PI * s[2],
    mode: modes[Math.min(3, Math.floor(s[3] * 4))],
    reps: 1 + Math.min(2, Math.floor(s[4] * 3)),
    horizon: 0.45 + 0.2 * s[5],
  };
  // The recursion's fixed point sits on a detailed part of the photo (a sign, a window), so the photo
  // keeps falling into its most readable piece.
  const d = await drawsFrom(stream, 'background/droste', 8 * 2 + 5);
  let best = 0;
  let bestW = -1;
  for (let c = 0; c < 8; c++) {
    const w = lookup(e, 'G', d[c * 2], d[c * 2 + 1]);
    if (w > bestW) {
      bestW = w;
      best = c;
    }
  }
  const j = 16;
  const droste: DrosteParams = {
    fixed: [clip(d[best * 2], 0.15, 0.85) * aspect, clip(d[best * 2 + 1], 0.15, 0.85)],
    scale: 2.2 + 1.8 * d[j],
    spiral: d[j + 1] < 0.4 ? 0 : d[j + 1] < 0.7 ? 1 : -1,
    turn: d[j + 2] < 0.5 ? 0 : (d[j + 3] - 0.5) * 0.8,
    zoom: 0.35 + 0.35 * d[j + 4],
    aspect,
  };
  return { sphere, droste };
}

/** Inside the photo rectangle (photo units). */
const insidePhoto = (x: number, y: number, aspect: number) => x >= 0 && x <= aspect && y >= 0 && y <= 1;

/**
 * Where a screen point (polar, around the void, in half-heights) lands in the nested photo: the
 * outermost copy that contains it. `level` counts how many times it was shrunk (0 = full size).
 */
export function drosteLevel(p: DrosteParams, r: number, angle: number): { x: number; y: number; level: number } {
  let qx = r * p.zoom * Math.cos(angle);
  let qy = r * p.zoom * Math.sin(angle);
  if (p.spiral !== 0 && r > 1e-9) {
    // Escher's Print Gallery map: log-polar shear, so going once around equals one level of nesting.
    const k = (p.spiral * Math.log(p.scale)) / (2 * Math.PI);
    const lr = Math.log(r * p.zoom);
    const lr2 = lr + k * angle;
    const a2 = angle - k * lr;
    qx = Math.exp(lr2) * Math.cos(a2);
    qy = Math.exp(lr2) * Math.sin(a2);
  }
  const [fx, fy] = p.fixed;
  const ct = Math.cos(p.turn);
  const st = Math.sin(p.turn);
  let level = 0;
  // Grow while the next larger copy still contains the point, then shrink until it is inside the photo.
  for (let i = 0; i < 64 && (qx !== 0 || qy !== 0); i++) {
    const nx = (ct * qx - st * qy) * p.scale;
    const ny = (st * qx + ct * qy) * p.scale;
    if (!insidePhoto(fx + nx, fy + ny, p.aspect)) break;
    qx = nx;
    qy = ny;
    level++;
  }
  for (let i = 0; i < 64 && !insidePhoto(fx + qx, fy + qy, p.aspect); i++) {
    const nx = (ct * qx + st * qy) / p.scale;
    const ny = (-st * qx + ct * qy) / p.scale;
    qx = nx;
    qy = ny;
    level--;
  }
  return { x: fx + qx, y: fy + qy, level };
}

/** Photo coordinates (u, v normalised) seen in a view direction on the celestial sphere. */
function sphereUv(p: SphereParams, aspect: number, dx: number, dy: number, dz: number): [number, number] {
  // Tilt about the screen x axis: tilt = π/2 brings the view axis onto the pole.
  const c = Math.cos(p.tilt);
  const s = Math.sin(p.tilt);
  const y2 = dy * c - dz * s;
  const z2 = dy * s + dz * c;
  const lat = Math.asin(clip(-y2, -1, 1)); // +π/2 = up
  const lon = Math.atan2(dx, z2) + p.yaw;
  // Angular size of one photo height, so the copies around the sphere keep the photo's aspect.
  const A = Math.PI / (aspect * p.reps);
  const u = mirror(lon / (A * aspect));
  let v: number;
  switch (p.mode) {
    case 'upright':
      v = p.horizon - lat / A;
      break;
    case 'inverted':
      v = p.horizon + lat / A;
      break;
    case 'reflected':
      v = p.horizon - Math.abs(lat) / A;
      break;
    case 'insideOut':
      v = 0.95 - Math.abs(lat) / A;
      break;
  }
  return [u, mirror(v)];
}

/** The photo at three detail levels, chosen by the footprint of a screen pixel (no shimmering moiré). */
export function mipSampler(img: RgbImage) {
  const full = photoSampler(img);
  const small = linearSmall(img);
  const ratio = Math.max(1, img.width / small.w);
  const tiny: SmallImage = { w: small.w, h: small.h, r: new Float32Array(small.r), g: new Float32Array(small.g), b: new Float32Array(small.b) };
  for (const ch of [tiny.r, tiny.g, tiny.b]) blurChannel(ch, tiny.w, tiny.h, 2);
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  return (u: number, v: number, footprintPx: number, out: number[]) => {
    const t1 = clip(Math.log(Math.max(1, footprintPx)) / Math.log(ratio + 1e-9), 0, 1);
    const t2 = clip(Math.log(Math.max(1, footprintPx / ratio)) / Math.log(4), 0, 1);
    if (t1 < 1) full(u, v, a);
    if (t1 > 0) {
      sampleSmall(small, u, v, b);
      if (t2 > 0) {
        const c2 = [0, 0, 0];
        sampleSmall(tiny, u, v, c2);
        for (let k = 0; k < 3; k++) b[k] = b[k] * (1 - t2) + c2[k] * t2;
      }
    }
    for (let k = 0; k < 3; k++) out[k] = t1 <= 0 ? a[k] : t1 >= 1 ? b[k] : a[k] * (1 - t1) + b[k] * t1;
  };
}

export interface Environment {
  /** Linear colour of the background (before exposure). */
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

/**
 * The photo seen through a background mapping, one sample per pixel (screen offsets in half-heights
 * around the camera's principal point, unrolled by the camera roll).
 */
export function renderEnvironment(
  kind: 'sphere' | 'droste',
  p: BackgroundParams,
  img: RgbImage,
  cam: Camera,
  voidCenter: [number, number],
  W: number,
  H: number,
  tint: ((c: number[]) => void) | null,
): Environment {
  const sample = mipSampler(img);
  const aspect = img.width / img.height;
  const n = W * H;
  const env: Environment = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
  const tanHalf = Math.tan(cam.fov / 2);
  const cr = Math.cos(-cam.roll);
  const sr = Math.sin(-cam.roll);
  const shift = cam.shift ?? [0, 0];
  const centre = kind === 'droste' ? voidCenter : shift;
  /** Photo uv (normalised) for a pixel position. */
  const uvAt = (x: number, y: number): [number, number] => {
    const ox = (x - W / 2) / (H / 2) - centre[0];
    const oy = (y - H / 2) / (H / 2) - centre[1];
    const ux = cr * ox - sr * oy;
    const uy = sr * ox + cr * oy;
    if (kind === 'sphere') {
      const dx = ux * tanHalf;
      const dy = uy * tanHalf;
      const l = Math.hypot(dx, dy, 1);
      return sphereUv(p.sphere, aspect, dx / l, dy / l, 1 / l);
    }
    const q = drosteLevel(p.droste, Math.hypot(ux, uy), Math.atan2(uy, ux));
    return [q.x / aspect, q.y];
  };
  const col = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [u, v] = uvAt(x + 0.5, y + 0.5);
      const [ua, va] = uvAt(x + 1.5, y + 0.5);
      const [ub, vb] = uvAt(x + 0.5, y + 1.5);
      // Pixel footprint in photo pixels; nesting seams give huge values there, which only soften the frame edge.
      const fp = Math.min(256, Math.max(Math.hypot((ua - u) * img.width, (va - v) * img.height), Math.hypot((ub - u) * img.width, (vb - v) * img.height)));
      sample(u, v, fp, col);
      if (tint) tint(col);
      const i = y * W + x;
      env.r[i] = col[0];
      env.g[i] = col[1];
      env.b[i] = col[2];
    }
  }
  return env;
}

/**
 * The photo's own lights in the environment shine: relative to what is in view, the brightest part
 * (lit windows, signs, street lights, a bright sky) gets an emissive boost, mid-tones stay dim.
 * `lo` and `hi` are percentiles of the environment's luminance in the frame (88th and 99.5th).
 */
export function emissive(l: number, glow: number, lo: number, hi: number): number {
  // The brightest parts in view reach a glowing level whatever their absolute brightness (a dim view
  // still has its lights), up to a limit; a black photo stays black since the colour itself is 0.
  const gain = Math.min(30, (1.0 + 2.0 * glow) / Math.max(1e-3, hi));
  return 0.2 + gain * smoothstep((l - lo) / Math.max(1e-3, hi - lo));
}

/** Luminance percentiles of an environment (on a fixed subsample, so the cost stays small). */
export function luminancePercentiles(env: Environment, qs: number[]): number[] {
  const n = env.r.length;
  const step = Math.max(1, Math.floor(n / 20000));
  const ls: number[] = [];
  for (let i = 0; i < n; i += step) ls.push(0.2126 * env.r[i] + 0.7152 * env.g[i] + 0.0722 * env.b[i]);
  ls.sort((a, b) => a - b);
  return qs.map((q) => ls[Math.min(ls.length - 1, Math.floor(q * (ls.length - 1)))] ?? 0);
}
