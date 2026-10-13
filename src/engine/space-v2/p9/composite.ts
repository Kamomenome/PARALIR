import { lightShape, type LightShape } from '../shared/atmosphere';
import type { ImageFeatures } from '../../common/analysis/features';
import type { RgbImage } from '../../common/image/normalize';
import { clip, mirror, smoothstep } from '../../common/math';
import { effectiveFeatures } from '../../common/analysis/effective';
import type { Camera } from './camera';
import { FLAME_CHUNKS, FlameAccum, accumulateFlame, buildFlame, flameColors, flameToHdr, type FlameParams } from './flame';
import { STRIP_COUNT, buildGrowth, newLayer, renderGrowth, type GrowthParams, type Layer, type PixelMap } from './growth';
import { Hdr, bloom, blurChannel, chiaroscuro, tonemap, vignette } from './hdr';
import { buildLayout, type SpaceLayout } from './layout';
import { PLATE_SLOTS, buildParts, renderParts, type PartsParams } from './parts';
import { lightMap, linearSmall, sampleSmall } from './photo';
import { drawsFrom, type SpaceSeeds } from './seeds';
import { buildBackgrounds, buildPipeline, emissive, luminancePercentiles, renderEnvironment, type BackgroundParams, type SpacePipeline } from './background';
import { buildForegrounds, renderForeground, type ForegroundParams } from './foregrounds';
import { buildSurreal, mergeTints, tintSmall, type SurrealColors } from './surreal';
import { SPACE_ALGORITHM_VERSIONS, type SpaceControls } from './types';

export type SpaceAlgorithm = 'flame' | 'growth' | 'parts' | 'composite';

/** Everything decided by the seed and the photo; independent of output size (data-model.md). */
export interface SpaceComposition {
  engineVersion: 'space-v1';
  algorithms: typeof SPACE_ALGORITHM_VERSIONS;
  /** The type of space (Phase 6): arrangement, organic form, symmetry, void, light and camera. */
  layout: SpaceLayout;
  camera: Camera;
  /** Rotation of the photo's light around the halo (seeded). */
  lightTwist: number;
  /** Which part of the photo's light is spread around (u0, v0, span in normalised photo units, seeded). */
  lightWindow: [number, number, number];
  /** How far the halo reaches from the void (half-heights, seeded): a tight glow or a wide one. */
  haloReach: number;
  voidRadius: number;
  flame: FlameParams;
  growth: GrowthParams;
  parts: PartsParams;
  /** Otherworldly colour rules and which elements follow them (Phase 7; used by the otherworld merge). */
  surreal: SurrealColors;
  /** Which background, foreground and merge make this world (Phase 8, seeded; fixable on screen). */
  pipeline: SpacePipeline;
  backgrounds: BackgroundParams;
  foregrounds: ForegroundParams;
  /**
   * 005 FR-507 (added to the restored 002 code): the light's shape (003 FR-315). Absent = the round void and halo
   * exactly as in 002, so the liked pictures reproduce.
   */
  shape?: LightShape;
}

/** The light is round (as in 002) unless a straight shape is given (005 FR-507). */
const isRound = (comp: SpaceComposition) => !comp.shape || comp.shape.kind === 'ring';
const shapeAt = (comp: SpaceComposition, x: number, y: number, W: number, H: number) =>
  lightShape({ shape: comp.shape!, layout: comp.layout, voidRadius: comp.voidRadius, haloReach: comp.haloReach }, x, y, W, H);

/** The only place where random numbers are drawn (fixed ids and counts). */
export async function composeSpace(seeds: SpaceSeeds, features: ImageFeatures, controls: SpaceControls, img: RgbImage): Promise<SpaceComposition> {
  const e = effectiveFeatures(features, controls.featureInfluence);
  const s = seeds.streams;
  const layout = await buildLayout(s.camera, e);
  const [cam, look, lw, flame, growth, parts, surreal, pipeline, backgrounds, foregrounds] = await Promise.all([
    drawsFrom(s.camera, 'camera/base', 2),
    drawsFrom(s.look, 'look/base', 2),
    drawsFrom(s.look, 'look/light', 4),
    buildFlame(s.flame, e, layout),
    buildGrowth(s.growth, e, layout),
    buildParts(s.parts, e, img.width / img.height, layout),
    buildSurreal(s.color, STRIP_COUNT, PLATE_SLOTS),
    buildPipeline(s.look),
    buildBackgrounds(s.look, e, img.width / img.height),
    buildForegrounds(s.look, e),
  ]);
  return {
    engineVersion: 'space-v1',
    algorithms: SPACE_ALGORITHM_VERSIONS,
    layout,
    camera: { fov: ((62 + 16 * cam[0]) * Math.PI) / 180, roll: layout.roll, shift: layout.vanish },
    lightTwist: look[0],
    // Sometimes the whole photo's light, sometimes a part of it (e.g. only the street lights or only the sky).
    lightWindow: lightWindowOf(lw),
    haloReach: 0.5 + 0.35 * lw[3],
    voidRadius: 0.18 + 0.1 * look[1],
    flame,
    growth,
    parts,
    surreal,
    pipeline,
    backgrounds,
    foregrounds,
  };
}

function lightWindowOf(d: number[]): [number, number, number] {
  const span = 0.55 + 0.29 * d[0];
  const free = 0.84 - span;
  return [0.08 + free * d[1], 0.08 + free * d[2], span];
}

export interface SpaceRender {
  rgba: Uint8ClampedArray;
  /** nearPlate: near opaque plates; membrane: visible membranes; solid: opaque structure pixels (tubes/plates). */
  layers: { nearPlate: Uint8Array; membrane: Uint8Array; solid: Uint8Array };
}

/** Screen offset (half-heights) of a pixel from a centre given in half-heights from the frame centre. */
const offset = (x: number, y: number, W: number, H: number, c: [number, number]): [number, number] => [
  (x + 0.5 - W / 2) / (H / 2) - c[0],
  (y + 0.5 - H / 2) / (H / 2) - c[1],
];

/** Distance from a centre (half-heights from the frame centre) in units of half the height. */
const radial = (x: number, y: number, W: number, H: number, c: [number, number]) => Math.hypot(...offset(x, y, W, H, c));

/**
 * Angular coordinate (0..1, continuous) of the light field under the layout's symmetry, measured in the
 * rolled camera frame: mirrored across the vertical, folded into rotational sectors, or free.
 */
function lightAngle(ox: number, oy: number, L: SpaceLayout, twist: number): number {
  if (L.lightMode !== 'halo') {
    // Light from beyond the frame: only a fan of angles is visible, so that fan spans the whole light
    // window (otherwise a single colour of the photo's light would fill the frame).
    const l = Math.hypot(L.lightCenter[0], L.lightCenter[1]) || 1;
    const dx = -L.lightCenter[0] / l;
    const dy = -L.lightCenter[1] / l;
    return mirror(0.5 + Math.atan2(ox * dy - oy * dx, ox * dx + oy * dy) / 1.6 + 2 * twist);
  }
  const c = Math.cos(-L.roll);
  const s = Math.sin(-L.roll);
  const ux = c * ox - s * oy;
  const uy = s * ox + c * oy;
  const a = Math.atan2(ux, uy); // 0 = down
  if (L.symmetry === 'mirror') return mirror(Math.abs(a) / Math.PI + 2 * twist);
  const a01 = (a + Math.PI) / (2 * Math.PI);
  if (L.symmetry === 'rotational') return mirror(mirror(2 * a01 * L.order) + 2 * twist);
  return 0.6 * mirror(2 * a01 + 2 * twist) + 0.4 * mirror(4 * a01 + 3.4 * twist);
}

/**
 * The photo's light arranged around its centre (Phase 5): the "light of the photo" (its bright parts,
 * heavily blurred) read in polar coordinates — angle across, distance down — so the glow behind
 * everything is the photo's own lights, repeated under the layout's symmetry. The centre is the void
 * for a halo, or a point beyond the frame edge for light from above or the side (Phase 6).
 */
function photoLightField(img: RgbImage, comp: SpaceComposition, W: number, H: number, tint: ((c: number[]) => void) | null): PixelMap {
  // In the otherworld merge the light follows the background's colour rule.
  const lm = tintSmall(lightMap(img), tint);
  // The more colourful half of the photo's light (e.g. street lights and signs rather than a plain
  // sky) goes next to the void, where the halo is brightest. Decided by the photo, not by chance.
  const [wu, wv, ws] = comp.lightWindow;
  const ya = Math.floor(wv * lm.h);
  const yb = Math.min(lm.h, Math.ceil((wv + ws) * lm.h));
  const xa = Math.floor(wu * lm.w);
  const xb = Math.min(lm.w, Math.ceil((wu + ws) * lm.w));
  let top = 0;
  let bottom = 0;
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const p = y * lm.w + x;
      const chroma = Math.max(lm.r[p], lm.g[p], lm.b[p]) - Math.min(lm.r[p], lm.g[p], lm.b[p]);
      if (y < (ya + yb) / 2) top += chroma;
      else bottom += chroma;
    }
  }
  const flipV = bottom > top;
  const r = new Float32Array(W * H);
  const g = new Float32Array(W * H);
  const b = new Float32Array(W * H);
  const c = [0, 0, 0];
  const L = comp.layout;
  const halo = L.lightMode === 'halo';
  const round = isRound(comp);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let a: number;
      let radial01: number;
      if (round) {
        const [ox, oy] = offset(x, y, W, H, L.lightCenter);
        a = lightAngle(ox, oy, L, comp.lightTwist);
        const rr = Math.hypot(ox, oy);
        radial01 = halo ? clip((rr - comp.voidRadius) / 1.1, 0, 1) : clip(rr / 1.8, 0, 1);
      } else {
        // Straight light (005 FR-507): the photo's light read along the light and away from it.
        const sh = shapeAt(comp, x + 0.5, y + 0.5, W, H);
        a = mirror(sh.s * 0.45 + 2 * comp.lightTwist);
        radial01 = clip(sh.d / (comp.shape!.kind === 'edge' ? 2 : 0.8), 0, 1);
      }
      const [u0, v0, span] = comp.lightWindow;
      sampleSmall(lm, u0 + span * a, v0 + span * (flipV ? 1 - radial01 : radial01), c);
      const i = y * W + x;
      r[i] = c[0];
      g[i] = c[1];
      b[i] = c[2];
    }
  }
  return { r, g, b };
}

/**
 * Renders one algorithm alone (same background and post-processing, for comparison) or the composite.
 * `quality` scales the flame's points per pixel. Every colour comes from the photo (Phase 5).
 * Phase 8: the composite is background → foreground → merge, each chosen by the seed (`comp.pipeline`)
 * or fixed on screen (`opts.pipeline`); the single-method views keep the light background and the depth merge.
 */
export function renderSpace(
  comp: SpaceComposition,
  img: RgbImage,
  features: ImageFeatures,
  c: SpaceControls,
  algo: SpaceAlgorithm,
  W: number,
  H: number,
  opts: { quality?: number; pipeline?: Partial<SpacePipeline> } = {},
): SpaceRender {
  const quality = opts.quality ?? 1;
  const hdr = new Hdr(W, H);
  const glow = 0.3 + 0.9 * c.glow;
  const isComposite = algo === 'composite';
  const pipe: SpacePipeline = isComposite ? { ...comp.pipeline, ...opts.pipeline } : { background: 'light', foreground: 'structures', merge: 'depth' };
  const tints = pipe.merge === 'otherworld' ? mergeTints(comp.surreal) : null;
  const L = comp.layout;

  // 1. Background (and the light that fogs and back-lights the structures).
  const light =
    pipe.background === 'light' || algo === 'flame'
      ? lightBackground(hdr, comp, img, c, algo, quality, tints)
      : environmentBackground(hdr, comp, img, c, pipe.background, tints);

  // 2. Foreground: 3D layers with a shared depth buffer: plates (painter) then tubes (z-test), back-lit by the light.
  const nearPlate = new Uint8Array(W * H);
  let membrane: Uint8Array = new Uint8Array(W * H);
  const solid = new Uint8Array(W * H);
  if (algo !== 'flame') {
    const layer = newLayer(W, H);
    membrane = layer.membrane;
    if (isComposite) {
      // Phase 9: the foreground algorithm chosen by the seed (or on screen).
      const plateTint = tints ? (slot: number) => tints.foreground(comp.surreal.plates[slot]) : null;
      renderForeground(pipe.foreground, comp, img, features, c, layer, light, plateTint, nearPlate);
    } else if (algo === 'parts') {
      renderParts(comp.parts, img, comp.camera, layer, {
        rings: Math.round(6 + 6 * c.depth),
        heroSize: 0.6 + 0.8 * c.shapeRetention,
        heroAlpha: 1,
        light: 0.5,
        rim: 0.35 * glow,
        rimMap: light,
        nearMask: nearPlate,
        detail: { G: features.maps.G, w: features.analysisWidth, h: features.analysisHeight },
      });
    } else {
      renderGrowth(comp.growth, img, comp.camera, layer, {
        arches: Math.round(4 + 5 * c.depth),
        membrane: 0.8 * c.organic,
        brightness: 0.5 + 0.9 * c.organic,
        rim: (0.5 + 0.9 * c.organic) * glow,
        rimMap: light,
      });
    }
    for (let i = 0; i < W * H; i++) solid[i] = layer.a[i] >= 0.999 && !layer.membrane[i] ? 1 : 0;
    // 3. Merge: the structures over the background, with depth fog in the background's own light.
    composeLayer(hdr, layer, light, c, glow);
  }

  // 4. Deepen the void (round light only, 005 FR-507), bloom, vignette, tone map.
  if (isRound(comp)) {
    const vm = voidMask(W, H, L.voidCenter, comp.voidRadius, 0.04);
    for (let i = 0; i < W * H; i++) {
      hdr.r[i] *= vm[i];
      hdr.g[i] *= vm[i];
      hdr.b[i] *= vm[i];
    }
  }
  bloom(hdr, 0.45, 0.35 + 0.9 * c.glow);
  vignette(hdr, 0.8);
  // The merge ends with a chiaroscuro curve: whatever the combination, a dark space with glowing light.
  if (isComposite) chiaroscuro(hdr, 1.5);
  return { rgba: tonemap(hdr, 1.5), layers: { nearPlate, membrane, solid } };
}

type Tints = ReturnType<typeof mergeTints>;

/** Background ①: the photo's light around the void, textured by the flame (Phases 4–6). */
function lightBackground(hdr: Hdr, comp: SpaceComposition, img: RgbImage, c: SpaceControls, algo: SpaceAlgorithm, quality: number, tints: Tints | null): PixelMap {
  const { W, H } = hdr;
  const glow = 0.3 + 0.9 * c.glow;
  const isComposite = algo === 'composite';
  const light = photoLightField(img, comp, W, H, tints?.background ?? null);
  let acc: FlameAccum | null = null;
  if (algo === 'flame' || isComposite) {
    acc = new FlameAccum(W, H);
    const flameSrc = tintSmall(linearSmall(img), tints?.background ?? null);
    accumulateFlame(comp.flame, flameColors(flameSrc), acc, Array.from({ length: FLAME_CHUNKS }, (_, k) => k), 24 * quality);
  }
  // Fog texture: the flame's density and local colour (photo colours carried by its points), blurred.
  const fogTex = acc ? densityTexture(acc) : null;
  // The light, shaped by a ring around the void (halo) or falling in from beyond the frame (above / side).
  const L = comp.layout;
  const halo = L.lightMode === 'halo';
  const voidOffset = Math.hypot(L.voidCenter[0], L.voidCenter[1]);
  const round = isRound(comp);
  const profile = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ring: number;
      if (round) {
        const r = radial(x, y, W, H, L.voidCenter);
        const inner = smoothstep((r - comp.voidRadius) / 0.35);
        // An off-centre void throws its light further, so the far side of the frame is not left empty.
        const outer = 1 - smoothstep((r - comp.haloReach - 0.9 * voidOffset) / 0.6);
        const src = halo ? 0 : Math.exp(-((radial(x, y, W, H, L.lightCenter) / 1.25) ** 2));
        // Light from beyond the frame: strong near its side, a faint rim around the void, dim elsewhere.
        ring = halo ? inner * outer * outer : inner * (0.08 + 2.4 * src + 0.15 * outer);
      } else {
        // Light from an edge or in straight bands (005 FR-507).
        ring = shapeAt(comp, x, y, W, H).intensity;
      }
      const i = y * W + x;
      profile[i] = Math.min(1, ring / 1.2);
      // The glow is textured by the flame's filaments (dense where its points gather), not a flat fog.
      // Straight light takes only a faint texture of the (round) flame.
      const k = 2.3 * glow * ring * (fogTex ? (round ? 0.12 + 1.9 * fogTex.density[i] * fogTex.density[i] : 0.75 + 0.25 * fogTex.density[i]) : 1);
      const tr = fogTex ? 0.7 + 0.3 * fogTex.r[i] : 1;
      const tg = fogTex ? 0.7 + 0.3 * fogTex.g[i] : 1;
      const tb = fogTex ? 0.7 + 0.3 * fogTex.b[i] : 1;
      hdr.r[i] = light.r[i] * k * tr;
      hdr.g[i] = light.g[i] * k * tg;
      hdr.b[i] = light.b[i] * k * tb;
    }
  }
  // Flame glow behind the structures, kept out of the central void.
  if (acc && round) flameToHdr(acc, hdr, algo === 'flame' ? 1.3 : 0.9 + 1.6 * c.glow, isComposite ? voidMask(W, H, L.voidCenter, comp.voidRadius, 0.15) : undefined);
  // Straight light: the filaments show faintly, only inside the light.
  else if (acc) flameToHdr(acc, hdr, (algo === 'flame' ? 1.3 : 0.9 + 1.6 * c.glow) * 0.25, isComposite ? profile : undefined);
  return light;
}

/**
 * Backgrounds ② and ③ (Phase 8): the photo wrapped onto a celestial sphere, or nested inside itself.
 * The photo's own lights shine (emissive boost of its bright parts), the depth towards the void dims,
 * and a soft glow of the environment itself rings the void. Its blurred light fogs the structures.
 */
function environmentBackground(hdr: Hdr, comp: SpaceComposition, img: RgbImage, c: SpaceControls, kind: 'sphere' | 'droste', tints: Tints | null): PixelMap {
  const { W, H } = hdr;
  const L = comp.layout;
  const env = renderEnvironment(kind, comp.backgrounds, img, comp.camera, L.voidCenter, W, H, tints?.background ?? null);
  const light = blurredLight(env, W, H);
  const glow = 0.3 + 0.9 * c.glow;
  const round = isRound(comp);
  const [lo, hi] = luminancePercentiles(env, [0.88, 0.995]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = radial(x, y, W, H, L.voidCenter);
      const lum = 0.2126 * env.r[i] + 0.7152 * env.g[i] + 0.0722 * env.b[i];
      const sh = round ? 0 : Math.min(1, shapeAt(comp, x, y, W, H).intensity / 1.2);
      // Far towards the void the world sinks into darkness; the photo's lights still glow.
      // Straight light (005 FR-507): the world sinks away from the light instead.
      const depth = round ? 0.3 + 0.7 * smoothstep((r - comp.voidRadius) / 1.1) : 0.3 + 0.7 * sh;
      const k = emissive(lum, c.glow, lo, hi) * depth;
      const inner = smoothstep((r - comp.voidRadius) / 0.35);
      const ring = round ? inner * (1 - smoothstep((r - comp.haloReach) / 0.6)) ** 2 : sh * sh;
      // The void is ringed by a glow in the environment's light: stronger where that light is, and where it
      // is weak a narrower glow at the void's edge still appears (in the light's colour).
      const ll = 0.2126 * light.r[i] + 0.7152 * light.g[i] + 0.0722 * light.b[i];
      const h = ll > 1e-6 ? 0.9 * glow * ring * ll + (1.2 * glow * ring * ring * ring * Math.max(0, 0.5 - ll)) / ll : 0;
      hdr.r[i] = env.r[i] * k + light.r[i] * h;
      hdr.g[i] = env.g[i] * k + light.g[i] * h;
      hdr.b[i] = env.b[i] * k + light.b[i] * h;
    }
  }
  // The structures are fogged and back-lit by a softer share of this light (the environment itself is
  // already bright where the light is).
  for (const ch of [light.r, light.g, light.b]) for (let i = 0; i < ch.length; i++) ch[i] *= 0.65;
  return light;
}

/** The environment heavily blurred and normalised (95th percentile = 1, capped at 1.5): the light of this background. */
function blurredLight(env: { r: Float32Array; g: Float32Array; b: Float32Array }, W: number, H: number): PixelMap {
  const f = 8;
  const w = Math.max(1, Math.ceil(W / f));
  const h = Math.max(1, Math.ceil(H / f));
  const small = { r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h) };
  const cnt = new Float32Array(w * h);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const j = Math.floor(y / f) * w + Math.floor(x / f);
      // Bright parts dominate the light (as in the photo's light map).
      const l = 0.2126 * env.r[i] + 0.7152 * env.g[i] + 0.0722 * env.b[i];
      const k = 0.15 + 0.85 * smoothstep((l - 0.05) / 0.5);
      small.r[j] += env.r[i] * k;
      small.g[j] += env.g[i] * k;
      small.b[j] += env.b[i] * k;
      cnt[j]++;
    }
  }
  for (const ch of [small.r, small.g, small.b]) {
    for (let j = 0; j < w * h; j++) ch[j] /= Math.max(1, cnt[j]);
    blurChannel(ch, w, h, Math.max(1, Math.round(w * 0.05)));
  }
  // Normalised by its 95th percentile (not the single brightest spot), so a few small lights in a dark
  // view do not leave the rest of the light near zero.
  const ls = Array.from({ length: w * h }, (_, j) => 0.2126 * small.r[j] + 0.7152 * small.g[j] + 0.0722 * small.b[j]).sort((a, b) => a - b);
  const mx = Math.max(1e-6, ls[Math.floor(0.95 * (ls.length - 1))]);
  const black = ls[ls.length - 1] <= 1e-6;
  const out: PixelMap = { r: new Float32Array(W * H), g: new Float32Array(W * H), b: new Float32Array(W * H) };
  const pairs = [
    [small.r, out.r],
    [small.g, out.g],
    [small.b, out.b],
  ] as const;
  for (let y = 0; y < H; y++) {
    const sy = clip((y + 0.5) / f - 0.5, 0, h - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = clip((x + 0.5) / f - 0.5, 0, w - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      const i = y * W + x;
      for (const [src, dst] of pairs) {
        const v = (src[y0 * w + x0] * (1 - fx) + src[y0 * w + x1] * fx) * (1 - fy) + (src[y1 * w + x0] * (1 - fx) + src[y1 * w + x1] * fx) * fy;
        dst[i] = black ? 0 : Math.min(1.5, v / mx);
      }
    }
  }
  return out;
}

/**
 * Blurred flame density (0..1) and the flame's local mean colour (normalised to its brightest channel),
 * used to texture and tint the glow. Where few points landed the tint fades to 1 (no change).
 */
function densityTexture(acc: FlameAccum): { density: Float32Array; r: Float32Array; g: Float32Array; b: Float32Array } {
  const { W, H } = acc;
  const f = 8;
  const w = Math.max(1, Math.ceil(W / f));
  const h = Math.max(1, Math.ceil(H / f));
  const dens = new Float32Array(w * h);
  const cr = new Float32Array(w * h);
  const cg = new Float32Array(w * h);
  const cb = new Float32Array(w * h);
  const cnt = new Float32Array(w * h);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const j = Math.floor(y / f) * w + Math.floor(x / f);
      dens[j] += Math.log1p(acc.count[i]);
      cr[j] += acc.sr[i];
      cg[j] += acc.sg[i];
      cb[j] += acc.sb[i];
      cnt[j] += acc.count[i];
    }
  }
  const radius = Math.max(1, Math.round(w * 0.03));
  for (const ch of [dens, cr, cg, cb, cnt]) blurChannel(ch, w, h, radius);
  let mx = 1e-9;
  for (const v of dens) mx = Math.max(mx, v);
  let cmax = 1e-9;
  for (const v of cnt) cmax = Math.max(cmax, v);
  const up = (src: Float32Array, x: number, y: number) => {
    const sy = clip((y + 0.5) / f - 0.5, 0, h - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    const sx = clip((x + 0.5) / f - 0.5, 0, w - 1);
    const x0 = Math.floor(sx);
    const x1 = Math.min(w - 1, x0 + 1);
    const fx = sx - x0;
    return (src[y0 * w + x0] * (1 - fx) + src[y0 * w + x1] * fx) * (1 - fy) + (src[y1 * w + x0] * (1 - fx) + src[y1 * w + x1] * fx) * fy;
  };
  const density = new Float32Array(W * H);
  const r = new Float32Array(W * H);
  const g = new Float32Array(W * H);
  const b = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      density[i] = Math.sqrt(up(dens, x, y) / mx);
      const n = up(cnt, x, y);
      const trust = smoothstep(n / (0.02 * cmax));
      const nn = Math.max(n, 1e-9);
      const lr = up(cr, x, y) / nn;
      const lg = up(cg, x, y) / nn;
      const lb = up(cb, x, y) / nn;
      const m = Math.max(lr, lg, lb, 1e-9);
      r[i] = 1 - trust + trust * (lr / m);
      g[i] = 1 - trust + trust * (lg / m);
      b[i] = 1 - trust + trust * (lb / m);
    }
  }
  return { density, r, g, b };
}

/** 1 outside the void, `floor` in its centre, smooth in between. */
function voidMask(W: number, H: number, centre: [number, number], radius: number, floor: number): Float32Array {
  const m = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = radial(x, y, W, H, centre);
      m[y * W + x] = floor + (1 - floor) * smoothstep((r - radius * 0.55) / (radius * 1.2));
    }
  }
  return m;
}

/** Fog (the photo's light at that pixel) and light falloff by depth, then alpha-over onto the background. */
function composeLayer(hdr: Hdr, layer: Layer, light: PixelMap, c: SpaceControls, glow: number): void {
  const density = 0.05 + 0.3 * c.fog;
  for (let i = 0; i < hdr.W * hdr.H; i++) {
    const a = layer.a[i];
    if (a <= 0) continue;
    const z = Number.isFinite(layer.depth[i]) ? layer.depth[i] : 6;
    const t = 1 - Math.exp(-density * Math.max(0, z - 1));
    const fall = Math.exp(-0.04 * z);
    const fk = 0.35 * glow;
    const r = (layer.r[i] * (1 - t) + light.r[i] * fk * t) * fall;
    const g = (layer.g[i] * (1 - t) + light.g[i] * fk * t) * fall;
    const b = (layer.b[i] * (1 - t) + light.b[i] * fk * t) * fall;
    hdr.r[i] = hdr.r[i] * (1 - a) + r * a;
    hdr.g[i] = hdr.g[i] * (1 - a) + g * a;
    hdr.b[i] = hdr.b[i] * (1 - a) + b * a;
  }
}
