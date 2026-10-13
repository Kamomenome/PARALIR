import type { RgbImage } from '../../../common/image/normalize';
import { clip, mirror, smoothstep } from '../../../common/math';
import type { Camera } from '../../shared/camera';
import { blurChannel, hash01 } from '../../shared/color';
import { FLAME_CHUNKS, FlameAccum, accumulateFlame, flameColors, flameToHdr, type FlameParams } from '../../shared/flame';
import { Hdr, bloom, tonemap, vignette } from '../../shared/hdr';
import type { PhotoObject } from '../../shared/object';
import { lightColours, linearSmall, mipSampler } from '../../shared/photo';
import { newLayer, renderPlates } from '../../shared/plates';
import { drawsFrom } from '../../draws';
import type { SpaceControls } from '../../types';

/**
 * World ⑤ The portal (003 FR-316; reference: a figure seen from behind before a gate of light). One large
 * object in the middle, back-lit as a silhouette with a glowing rim and vertical streaks of stretched
 * pixels, before a mirror-symmetric gate: two straight pillars of light, a softly swirling glowing surface
 * of the photo between them, iridescent warped photo fringes outside them, and smoke-like Fractal Flame
 * wisps in the dark around. Every colour comes from the photo (its light colours and its pixels).
 * Coordinates are half-heights of the frame, so nothing depends on the output size.
 */
export interface PortalParams {
  /** Pillars: distance from the axis and half-width; the gate's half-height. */
  pillarX: number;
  pillarW: number;
  gateTop: number;
  /** Central dark seam half-width. */
  seamW: number;
  /**
   * The photo seen in the gate: mirrored about the vertical line u = centre[0] of the photo (the left side
   * reflected), half a frame height showing `zoom` of the photo's height; a slight liquid shimmer (amp).
   */
  f1: number;
  f2: number;
  amp: number;
  phases: [number, number, number];
  centre: [number, number];
  zoom: number;
  /** Fringe width and where its iridescent run of the photo's colours starts. */
  fringeW: number;
  hueTwist: number;
  /** Figure: depth, size, and streaks (share of columns, run length). */
  z: number;
  size: number;
  /** How high the figure stands (share of its size above the axis). */
  rise: number;
  streaks: number;
  streakLen: number;
  seed: number;
}

export async function buildPortal(stream: Uint8Array): Promise<PortalParams> {
  const d = await drawsFrom(stream, 'portal/main', 20);
  return {
    pillarX: 0.45 + 0.45 * d[0],
    pillarW: 0.018 + 0.025 * d[1],
    gateTop: 0.85 + 0.3 * d[2],
    seamW: 0.04 + 0.05 * d[3],
    f1: 2 + 3 * d[4],
    f2: 2 + 3 * d[5],
    amp: 0.015 + 0.035 * d[6],
    phases: [2 * Math.PI * d[7], 2 * Math.PI * d[8], 2 * Math.PI * d[9]],
    centre: [0.35 + 0.3 * d[10], 0.45 + 0.1 * d[11]],
    zoom: 0.42 + 0.16 * d[12],
    fringeW: 0.12 + 0.18 * d[13],
    hueTwist: d[14],
    z: 2.2,
    size: 0.8 + 0.45 * d[15],
    rise: 0.3 + 0.45 * d[19],
    streaks: 0.06 + 0.12 * d[16],
    streakLen: 0.05 + 0.12 * d[17],
    seed: Math.floor(d[18] * 1e6),
  };
}

/**
 * The gate (linear colour) and where it is (`inside`, 0..1 between the pillars). A function of |x| and y
 * only, so it is exactly mirror-symmetric about the vertical axis.
 */
export function portalField(p: PortalParams, img: RgbImage, W: number, H: number): { r: Float32Array; g: Float32Array; b: Float32Array; inside: Float32Array } {
  const sample = mipSampler(img);
  const aspect = img.width / img.height;
  const [light] = lightColours(img);
  const n = W * H;
  const out = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), inside: new Float32Array(n) };
  const c = [0, 0, 0];
  const foot = Math.max(1, (2 * p.zoom * img.height) / H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const X = (x + 0.5 - W / 2) / (H / 2);
      const Y = (y + 0.5 - H / 2) / (H / 2);
      const ax = Math.abs(X);
      const i = y * W + x;
      const vfade = 1 - smoothstep((Math.abs(Y) - p.gateTop) / 0.3);
      const inside = smoothstep((p.pillarX - ax) / 0.04) * vfade;
      out.inside[i] = inside;
      // The photo itself, mirrored left and right (as an ink blot); in the gate it shimmers slightly like liquid.
      let u = ax;
      let v = Y;
      if (inside > 0) {
        u += inside * p.amp * Math.sin(p.f1 * Y + p.phases[0]);
        v += inside * p.amp * Math.cos(p.f2 * ax + p.phases[1]);
      }
      sample(mirror(p.centre[0] - (p.zoom * u) / aspect), mirror(p.centre[1] + p.zoom * v), foot, c);
      // In the gate the photo glows (brighter towards the pillars, a darker seam on the axis); outside it is dim.
      const toPillar = smoothstep((ax - p.pillarX * 0.3) / (p.pillarX * 0.7));
      const seam = 1 - 0.5 * Math.exp(-((X / p.seamW) ** 2));
      const k = 0.28 + inside * (0.9 + 0.9 * toPillar) * seam;
      let r = c[0] * k;
      let g = c[1] * k;
      let b = c[2] * k;
      // The pillars: straight vertical light in the photo's light colour.
      const dp = Math.abs(ax - p.pillarX);
      const pil = (3 * Math.exp(-((dp / p.pillarW) ** 2)) + 0.2 * Math.exp(-dp / 0.05)) * vfade;
      r += light[0] * pil;
      g += light[1] * pil;
      b += light[2] * pil;
      // The fringe outside the pillars: iridescent, its colour running fast through the photo's own colours
      // (read along a diagonal of the photo), so a red photo shimmers in its reds.
      const edge = p.pillarX + p.fringeW * (0.55 + 0.45 * Math.sin(Y * 6 + p.phases[2]) * Math.cos(Y * 2.3 + p.phases[0]));
      const fr = ax > p.pillarX ? smoothstep((edge - ax) / 0.03) * vfade : 0;
      if (fr > 0) {
        const run = p.hueTwist + 1.6 * Y + 3 * ax + 0.3 * Math.sin(9 * Y + p.phases[1]);
        sample(mirror(run), mirror(0.7 * run + 0.2 * Math.cos(11 * ax + p.phases[2])), 2, c);
        const kf = 1.5 / (0.2 + 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
        r += c[0] * (kf * c[0] + 0.3) * fr * 0.4;
        g += c[1] * (kf * c[1] + 0.3) * fr * 0.4;
        b += c[2] * (kf * c[2] + 0.3) * fr * 0.4;
      }
      out.r[i] = r;
      out.g[i] = g;
      out.b[i] = b;
    }
  }
  return out;
}

export function renderPortal(
  p: PortalParams,
  flame: FlameParams,
  obj: PhotoObject,
  img: RgbImage,
  cam: Camera,
  c: SpaceControls,
  W: number,
  H: number,
  quality: number,
): { rgba: Uint8ClampedArray; objects: Float32Array } {
  const hdr = new Hdr(W, H);
  const field = portalField(p, img, W, H);
  const gain = 0.6 + 0.8 * c.light;
  for (let i = 0; i < W * H; i++) {
    hdr.r[i] = field.r[i] * gain;
    hdr.g[i] = field.g[i] * gain;
    hdr.b[i] = field.b[i] * gain;
  }
  // Smoke-like wisps in the dark around the gate: a mirrored Fractal Flame, kept outside the gate.
  const acc = new FlameAccum(W, H);
  const wisp = { ...flame, screen: [0, -0.05] as [number, number], roll: 0, mirror: true };
  accumulateFlame(wisp, flameColors(linearSmall(img)), acc, Array.from({ length: FLAME_CHUNKS }, (_, k) => k), 24 * quality);
  const outside = Float32Array.from(field.inside, (v) => 1 - v);
  flameToHdr(acc, hdr, 0.5 + 0.6 * c.light, outside);
  // The gate glows before the figure stands in it: its light blooms around the figure, not over it.
  bloom(hdr, 0.45, 0.25 + 0.5 * c.light);

  // The figure: one large plate, centre-bottom, facing the camera.
  const t = Math.tan(cam.fov / 2);
  const camera = { fov: cam.fov, roll: 0 };
  const layer = newLayer(W, H);
  const cut = newLayer(W, H);
  const size = p.size * (0.85 + 0.3 * c.size) * t * p.z;
  const plate = { crop: obj.crop, centre: [0, size * p.rise, p.z] as [number, number, number], size, right: [1, 0, 0] as [number, number, number], up: [0, 1, 0] as [number, number, number], edge: [0, 0, 0] as [number, number, number] };
  renderPlates([{ ...plate, mask: null }], img, camera, layer);
  renderPlates([{ ...plate, mask: obj.mask }], img, camera, cut);
  // A silhouette is a solid body: the cutout is closed (thin parts and holes filled), its colour from the whole crop.
  const closed = Float32Array.from(cut.a);
  blurChannel(closed, W, H, Math.max(1, Math.round(H * 0.03)));
  for (let i = 0; i < W * H; i++) layer.a[i] = Math.min(layer.a[i], Math.max(cut.a[i], smoothstep((closed[i] - 0.15) / 0.2)));
  // Rim: a thin line where the coverage falls off, the gate's light wrapping round the edge.
  const ab = Float32Array.from(layer.a);
  blurChannel(ab, W, H, Math.max(1, Math.round(H * 0.005)));
  const [light] = lightColours(img);
  const run = Math.max(2, Math.round(p.streakLen * H));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = layer.a[i];
      if (a <= 0) continue;
      // Vertical streaks: in some columns the figure's pixels are stretched downwards (a run repeats its top pixel).
      let sr = layer.r[i];
      let sg = layer.g[i];
      let sb = layer.b[i];
      let streak = 0;
      if (hash01(x * 7919 + p.seed) < p.streaks) {
        const ys = y - (y % run);
        const j = ys * W + x;
        if (layer.a[j] > 0.5) {
          sr = layer.r[j];
          sg = layer.g[j];
          sb = layer.b[j];
          streak = 1;
        }
      }
      const rim = clip(a * (1 - ab[i]) ** 2 * 4 + (a < 0.9 ? 0.3 * (1 - a) : 0), 0, 1);
      const grain = 0.85 + 0.3 * hash01(i + p.seed);
      const sil = (streak ? 0.45 : 0.22) * grain;
      const rimK = rim * (1.2 + 1.2 * c.light);
      const r = sr * sil + light[0] * rimK * (0.4 + sr);
      const g = sg * sil + light[1] * rimK * (0.4 + sg);
      const b = sb * sil + light[2] * rimK * (0.4 + sb);
      hdr.r[i] = hdr.r[i] * (1 - a) + r * a;
      hdr.g[i] = hdr.g[i] * (1 - a) + g * a;
      hdr.b[i] = hdr.b[i] * (1 - a) + b * a;
    }
  }
  bloom(hdr, 0.45, 0.15);
  vignette(hdr, 0.7);
  return { rgba: tonemap(hdr, 1.5), objects: layer.a };
}
