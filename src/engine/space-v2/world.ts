import type { ImageFeatures } from '../common/analysis/features';
import type { RgbImage } from '../common/image/normalize';
import { clip } from '../common/math';
import { effectiveFeatures } from '../common/analysis/effective';
import type { ThemeRange } from '../common/parts/lasso';
import type { PhotoParts } from '../common/parts/types';
import type { Camera } from './shared/camera';
import { buildAtmosphere, renderAtmosphere, type Atmosphere } from './shared/atmosphere';
import { finish } from './shared/backdrop';
import { Hdr } from './shared/hdr';
import { mainObject, mosaicObject, rangeObject } from './shared/object';
import { changedWeight, spreadOver, turnHue } from './shared/spread';
import { drawsFrom } from './draws';
import type { SpaceSeeds } from './seeds';
import { FIXED_LOOK, chaosOf, type SpaceControls } from './types';
import { SPACE_ALGORITHM_VERSIONS } from './versions';
import type { ComposeContext, WorldDef } from './worldDef';
import { WORLDS } from './worlds';

/**
 * The spatial mode (space-v2, 003): each picture is one of the registered worlds (worlds/index.ts), over the
 * 002 Phase 9 background the user liked (FR-314) or drawn its own way. The seed picks the world (the photo's
 * conditions tilt the odds) and every value inside it.
 */
type Registered = (typeof WORLDS)[number];
export type WorldType = Registered['type'];
export const WORLD_TYPES: readonly WorldType[] = WORLDS.map((w) => w.type);

/** Each registered world's parameters, under its name (world.copies, world.mosaic, …). */
type WorldParams = { [D in Registered as D['type']]: D extends WorldDef<string, infer P> ? P : never };

export type SpaceWorld = {
  engineVersion: 'space-v2';
  algorithms: Readonly<Record<string, string>>;
  type: WorldType;
  camera: Camera;
  /** Whether the photo has a subject (the split world is never chosen without one). */
  hasSubject: boolean;
  /** The background: the 002 Phase 9 background (light field, celestial sphere or nested photo; FR-314). */
  atmosphere: Atmosphere;
  /** The seed of where the world spreads over the photo below 変貌 0.5 (021 FR-2102). */
  morphSeed: number;
  /** How far (degrees, either way) the colours of what changed turn at 変貌 1 (021 FR-2108). */
  morphHue: number;
} & WorldParams;

export interface WorldRender {
  rgba: Uint8ClampedArray;
  /** Coverage of the drawn objects. */
  objects: Float32Array | null;
}

function pick<T extends string>(u: number, options: [T, number][]): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let t = u * total;
  for (const [v, w] of options) {
    if (t < w) return v;
    t -= w;
  }
  return options[options.length - 1][0];
}

/**
 * Odds of the worlds (research R-306), in the registry's order: dark photos lean to darkness and light; the split
 * world needs a subject. Features are re-centred on typical photos.
 */
export function worldOdds(e: { L: number }, hasSubject: boolean): [WorldType, number][] {
  const light = clip((e.L - 0.2) / 0.5, 0, 1);
  return WORLDS.map((w) => [w.type, w.odds(light, hasSubject)]);
}

/** The only place where random numbers are drawn (fixed ids and counts). */
export async function composeWorld(seeds: SpaceSeeds, features: ImageFeatures, img: RgbImage, parts: PhotoParts | null = null): Promise<SpaceWorld> {
  const e = effectiveFeatures(features, FIXED_LOOK.featureInfluence);
  const s = seeds.streams;
  const hasSubject = mainObject(img, features, parts).subject;
  const [t, cam, [m], hue] = await Promise.all([
    drawsFrom(s.type, 'type/main', 2),
    drawsFrom(s.camera, 'camera/main', 2),
    drawsFrom(s.type, 'morph/seed', 1),
    drawsFrom(s.type, 'morph/hue', 2),
  ]);
  const fov = ((58 + 14 * cam[0]) * Math.PI) / 180;
  const ctx: ComposeContext = { seeds, features, img, fov };
  // Each world draws from its own stream, so building them together never changes their values.
  const [atmosphere, ...params] = await Promise.all([buildAtmosphere(s.atmos, features, FIXED_LOOK.featureInfluence, img.width / img.height), ...WORLDS.map((w) => w.build(ctx))]);
  return {
    engineVersion: 'space-v2',
    algorithms: SPACE_ALGORITHM_VERSIONS,
    type: pick(t[0], worldOdds(e, hasSubject)),
    camera: { fov, roll: (cam[1] - 0.5) * 0.3 },
    hasSubject,
    atmosphere,
    morphSeed: Math.floor(m * 2 ** 31),
    morphHue: (hue[0] < 0.5 ? -1 : 1) * (90 + 60 * hue[1]),
    ...(Object.fromEntries(WORLDS.map((w, i) => [w.type, params[i]])) as WorldParams),
  };
}

/**
 * Draws the world (or another type fixed on screen) at W × H with its registered renderer. `quality` scales the
 * background flame's points per pixel.
 */
export function renderWorld(w: SpaceWorld, img: RgbImage, features: ImageFeatures, c: SpaceControls, W: number, H: number, type: WorldType = w.type, quality = 0.4, parts: PhotoParts | null = null, range: ThemeRange | null = null): WorldRender {
  const def = WORLDS.find((d) => d.type === type);
  if (!def) throw new Error(`unknown world ${type}`);
  // The lasso's range is the subject in every way when there is one (013B FR-1309).
  const obj = (range && rangeObject(img, range)) || mainObject(img, features, parts);
  const out = def.render({
    world: w,
    img,
    features,
    controls: c,
    W,
    H,
    quality,
    parts,
    obj,
    // The range of the rectangles and the theme: a lasso's (005 FR-504), else the estimate the user liked, steadied
    // by the AI's candidates (004 FR-407, FR-411).
    ranged: () => (range && rangeObject(img, range)) || mosaicObject(img, features, parts),
  });
  // Below 0.5 the world spreads over the photo, the rest first and the subject after (021 FR-2102); 0.5 as drawn.
  if (c.morph < 0.5) return { rgba: spreadOver(out.rgba, w.morphSeed, obj, img, W, H, c.morph / 0.5), objects: out.objects };
  // Beyond, the colours of what changed turn (021 FR-2108).
  const chaos = chaosOf(c);
  if (chaos <= 0) return out;
  return { rgba: turnHue(out.rgba, changedWeight(out.rgba, out.objects, img, W, H), chaos * w.morphHue, 1 + 0.4 * chaos), objects: out.objects };
}

/** The background alone, finished like a world (for tests and comparisons). */
export function renderBackgroundOnly(a: Atmosphere, img: RgbImage, W: number, H: number, quality = 0.4): Uint8ClampedArray {
  const hdr = new Hdr(W, H);
  renderAtmosphere(hdr, a, img, { glow: FIXED_LOOK.light, fog: 0.5 }, quality);
  return finish(hdr, true);
}
