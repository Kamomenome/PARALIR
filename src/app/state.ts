import { analyze, type ImageFeatures } from '../engine/common/analysis/features';
import { pixelHash, type Hex64 } from '../engine/common/hash/sha256';
import { snapshotNow, type TimeSnapshot } from '../engine/common/time/snapshot';
import { lassoHints, lassoRange, type Lasso, type ThemeRange } from '../engine/common/parts/lasso';
import type { PhotoParts } from '../engine/common/parts/types';
import type { SpaceRecipe } from '../engine/recipe';
import { CURRENT_ENGINE, loadEngine, type EngineSeeds, type EngineWorld } from '../engine/engines';
import { buildSpaceSeedInput } from '../engine/space-v2/seeds';
import { DEFAULT_SPACE_CONTROLS, type SpaceControls } from '../engine/space-v2/types';
import type { LoadedSource } from './decode';

export interface SourceState {
  id: number;
  loaded: LoadedSource;
  pixelHash: Hex64;
  features: ImageFeatures;
}

/**
 * Everything that determines the current work (the spatial mode only, 006). Seed-relevant parts:
 * source, time, variationIndex.
 */
export interface AppState {
  time: TimeSnapshot;
  variationIndex: number;
  source: SourceState | null;
  /** One-step history: the work just before the last change (013 FR-1308). */
  previous: Step | null;
  /** The kind of the last change: a run of the same slider is one step (013 FR-1308). */
  lastStep: string | null;
  /** The engine that composes and draws the work (009 FR-904): the current one, or a frozen one for an older recipe. */
  engineId: string;
  /** A new photo is shown as it is until the first action (011 FR-1101); the world is composed behind it all the same. */
  showing: 'photo' | 'world';
  /** Spatial mode (spec 003): its own sliders, the world fixed on screen (or 'auto'), seed and world. */
  spaceControls: SpaceControls;
  spaceType: string;
  spaceSeeds: EngineSeeds | null;
  spaceWorld: EngineWorld | null;
  /** What the on-device AI saw in the photo (004); null until the spatial mode first needs it. */
  spaceParts: PartsResult | null;
  /** Rough lassos over the picture (005 FR-504; several with Shift, 013B FR-1310) and the one range they give; none: []. */
  spaceLassos: Lasso[];
  spaceRange: ThemeRange | null;
}

/** The AI parts of a photo, or why there are none (004 FR-408). */
export type PartsResult = { status: 'ok'; parts: PhotoParts; ms: number } | { status: 'off' | 'failed'; reason: string };

/** Makes the parts of a photo (the browser's AI); none in tests and tools unless set. */
export type PartsProvider = (source: SourceState) => Promise<PartsResult>;

let partsProvider: PartsProvider | null = null;
const partsCache = new WeakMap<LoadedSource, Promise<PartsResult>>();
/** Every action waits for the parts, so an AI that never answers must not hold the app (008 FR-807). */
let partsTimeoutMs = 60_000;

export function usePartsProvider(p: PartsProvider | null, opts: { timeoutMs?: number } = {}): void {
  partsProvider = p;
  partsTimeoutMs = opts.timeoutMs ?? 60_000;
}

/** The time-out is remembered for the photo like any other result: later actions do not wait again. */
function withTimeout(p: Promise<PartsResult>, ms: number): Promise<PartsResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<PartsResult>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'failed', reason: 'AI が時間内に終わりませんでした（推定で描画）' }), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(timer)), late]);
}

/** Cuts things out at points inside a lasso (the browser's AI); none in tests and tools unless set. */
export type LassoCutter = (source: SourceState, hints: [number, number][]) => Promise<Uint8Array[]>;

let lassoCutter: LassoCutter | null = null;

export function useLassoCutter(c: LassoCutter | null): void {
  lassoCutter = c;
}

/**
 * Sets the lasso (null: clears them all); `add` (Shift) adds it to those there are (013B FR-1310). Each lasso's range is
 * the AI candidate it circles, else the lasso itself (005 FR-504); the work's range is all of them together.
 */
export async function setLasso(s: AppState, lasso: Lasso | null, add = false): Promise<AppState> {
  const lassos = !lasso || lasso.length < 3 ? [] : add ? [...s.spaceLassos, lasso] : [lasso];
  return applyLassos({ ...s, ...remember(s, 'lasso') }, lassos);
}

async function rangeOf(s: AppState, lasso: Lasso): Promise<ThemeRange> {
  const source = s.source!;
  const pr = await partsFor(source);
  const parts = pr.status === 'ok' ? pr.parts : null;
  let cuts: Uint8Array[] = [];
  if (parts && lassoCutter) {
    try {
      cuts = await lassoCutter(source, lassoHints(lasso));
    } catch {
      cuts = [];
    }
  }
  const { width, height } = source.loaded.img;
  const k = 320 / Math.max(width, height);
  return lassoRange(lasso, parts, cuts, parts?.w ?? Math.max(1, Math.round(width * k)), parts?.h ?? Math.max(1, Math.round(height * k)));
}

async function applyLassos(s: AppState, lassos: Lasso[]): Promise<AppState> {
  if (!lassos.length || !s.source) return { ...s, spaceLassos: [], spaceRange: null };
  const ranges: ThemeRange[] = [];
  for (const l of lassos) ranges.push(await rangeOf(s, l));
  // One range: every lasso's, together (the largest value at each point).
  const mask = Uint8Array.from(ranges[0].mask);
  for (const r of ranges.slice(1)) for (let i = 0; i < mask.length; i++) mask[i] = Math.max(mask[i], r.mask[i]);
  const spaceRange: ThemeRange = { w: ranges[0].w, h: ranges[0].h, mask, source: ranges.some((r) => r.source === 'lasso+ai') ? 'lasso+ai' : 'lasso' };
  return { ...s, spaceLassos: lassos, spaceRange };
}

/** The parts of a photo, made once per loaded photo. */
export function partsFor(source: SourceState): Promise<PartsResult> {
  let hit = partsCache.get(source.loaded);
  if (!hit) {
    hit = partsProvider
      ? withTimeout(
          partsProvider(source).catch((e): PartsResult => ({ status: 'failed', reason: e instanceof Error ? e.message : String(e) })),
          partsTimeoutMs,
        )
      : Promise.resolve<PartsResult>({ status: 'off', reason: 'AI を使っていません' });
    partsCache.set(source.loaded, hit);
  }
  return hit;
}

/** What 「ひとつ戻す」 brings back (013 FR-1308): the settings a change can touch. */
export interface Step {
  time: TimeSnapshot;
  variationIndex: number;
  spaceControls: SpaceControls;
  spaceType: string;
  spaceLassos: Lasso[];
  spaceRange: ThemeRange | null;
}

const stepOf = (s: AppState): Step => ({
  time: s.time,
  variationIndex: s.variationIndex,
  spaceControls: { ...s.spaceControls },
  spaceType: s.spaceType,
  spaceLassos: s.spaceLassos,
  spaceRange: s.spaceRange,
});

/** Remembers the work before this change; with `runs`, the same change again (dragging one slider) stays one step. */
function remember(s: AppState, step: string, runs = false): Pick<AppState, 'previous' | 'lastStep'> {
  if (!s.source) return { previous: s.previous, lastStep: s.lastStep };
  if (runs && s.lastStep === step && s.previous) return { previous: s.previous, lastStep: step };
  return { previous: stepOf(s), lastStep: runs ? step : null };
}

/** The artwork time is taken once when the app opens and then stays fixed (FR-018). */
export function createInitialState(nowMs: number, timeZone: string): AppState {
  return {
    time: snapshotNow(nowMs, timeZone),
    variationIndex: 0,
    source: null,
    previous: null,
    lastStep: null,
    engineId: CURRENT_ENGINE,
    showing: 'photo',
    spaceControls: { ...DEFAULT_SPACE_CONTROLS },
    spaceType: 'auto',
    spaceSeeds: null,
    spaceWorld: null,
    spaceParts: null,
    spaceLassos: [],
    spaceRange: null,
  };
}

export async function prepareSource(id: number, loaded: LoadedSource): Promise<SourceState> {
  return { id, loaded, pixelHash: await pixelHash(loaded.img), features: analyze(loaded.img) };
}

/** The seed and the world for the current photo/time/variation (source, time or variation changed). */
export async function reseed(s: AppState): Promise<AppState> {
  return composeSpaceState(s);
}

/** The seed and world for the current photo/time/variation, with the work's engine. */
async function composeSpaceState(s: AppState): Promise<AppState> {
  if (!s.source) return { ...s, spaceSeeds: null, spaceWorld: null, spaceParts: null };
  const spaceParts = await partsFor(s.source);
  const parts = spaceParts.status === 'ok' ? spaceParts.parts : null;
  const engine = await loadEngine(s.engineId);
  const spaceSeeds = await engine.seeds(buildSpaceSeedInput(s.source.pixelHash, s.time, s.variationIndex));
  const spaceWorld = await engine.compose(spaceSeeds, s.source.features, s.spaceControls, s.source.loaded.img, parts);
  return { ...s, spaceSeeds, spaceWorld, spaceParts };
}

/** Spatial sliders keep the composition; only the feature influence re-maps the odds (003 FR-309). */
export async function setSpaceControls(s: AppState, patch: Partial<SpaceControls>): Promise<AppState> {
  const spaceControls = { ...s.spaceControls, ...patch };
  const next = { ...s, spaceControls, ...remember(s, `slider:${Object.keys(patch).sort().join(',')}`, true) };
  if (patch.featureInfluence !== undefined && patch.featureInfluence !== s.spaceControls.featureInfluence) {
    return composeSpaceState(next);
  }
  return next;
}

/** Fixing (or releasing) the world type re-renders without recomposing (FR-310). */
export function setSpaceType(s: AppState, spaceType: string): AppState {
  return { ...s, spaceType, ...remember(s, 'type') };
}

/** Applies a checked recipe with the engine its versions belong to (009 FR-905). */
export async function applySpaceRecipe(s: AppState, r: SpaceRecipe, engineId: string = CURRENT_ENGINE): Promise<AppState> {
  const next = await reseed({
    ...s,
    engineId,
    showing: 'world',
    time: { ...r.time, resolution: 'exact' },
    variationIndex: r.variationIndex,
    spaceControls: { ...r.controls },
    spaceType: r.worldType,
    ...remember(s, 'recipe'),
  });
  // Several lassos since 013B; one `lasso` in older recipes.
  return applyLassos(next, r.lassos ?? (r.lasso ? [r.lasso] : []));
}

/**
 * The photo alone, as soon as it is read (012 FR-1203): shown as it is while the AI and the world are made behind it
 * (withSource follows). No world yet, so nothing can be saved or exported.
 */
export function withPhoto(s: AppState, source: SourceState, time: TimeSnapshot = s.time): AppState {
  // The artwork time is when the photo goes in (016 FR-1601).
  return { ...s, source, time, engineId: CURRENT_ENGINE, showing: 'photo', previous: null, lastStep: null, spaceLassos: [], spaceRange: null, spaceSeeds: null, spaceWorld: null, spaceParts: null };
}

/** A new photo starts a new work with the current engine: the one-step history is cleared. */
export async function withSource(s: AppState, source: SourceState): Promise<AppState> {
  return reseed({ ...s, source, engineId: CURRENT_ENGINE, showing: 'photo', previous: null, lastStep: null, spaceLassos: [], spaceRange: null });
}

/** Seed-changing transition that remembers where it came from. */
async function changeSeed(s: AppState, patch: Partial<Pick<AppState, 'time' | 'variationIndex'>>): Promise<AppState> {
  return reseed({ ...s, ...patch, ...remember(s, 'seed') });
}

/**
 * The first action on a new photo shows the world (011 FR-1102). 「変える」 (013 FR-1307) only shows it; any other
 * action (`apply`) also makes its change.
 */
export async function firstLook(s: AppState, fn: (s: AppState) => AppState | Promise<AppState>, apply = false): Promise<AppState> {
  if (s.showing === 'world') return fn(s);
  const shown: AppState = { ...s, showing: 'world' };
  return apply ? fn(shown) : shown;
}

/**
 * No おまかせ (013B FR-1311): a work still drawing the seed's choice ('auto', the first photo or an old recipe) settles on
 * that mode, so it is the one selected and 写真に合わせる強さ never swaps it. Not a step to undo.
 */
export function settleMode(s: AppState): AppState {
  return s.spaceType === 'auto' && s.spaceWorld ? { ...s, spaceType: s.spaceWorld.type } : s;
}

/** 「元の画像を表示」: the photo as it is, every setting kept (017 FR-1705); 「反映」 (firstLook) shows the picture again. */
export function showPhoto(s: AppState): AppState {
  return { ...s, showing: 'photo' };
}

/** The next variation of the same photo and time (R04). No button since 013; old recipes and the pixel records use variations. */
export function nextWorld(s: AppState): Promise<AppState> {
  return changeSeed(s, { variationIndex: s.variationIndex + 1 });
}

/** 「ひとつ戻す」: back to the work before the last change (013 FR-1308). */
export async function restorePrevious(s: AppState): Promise<AppState> {
  if (!s.previous) return s;
  const p = s.previous;
  const back = { ...s, time: p.time, variationIndex: p.variationIndex, spaceControls: { ...p.spaceControls }, spaceType: p.spaceType, previous: null, lastStep: null };
  // The lasso's range came with it; nothing to cut again.
  return { ...(await reseed(back)), spaceLassos: p.spaceLassos, spaceRange: p.spaceRange };
}
