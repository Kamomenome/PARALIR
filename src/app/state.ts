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
  /** One-step history: the state just before the composition seed last changed (FR-022). */
  previous: SeedKey | null;
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
  /** A rough lasso over the preview and the range it gives (005 FR-504); null when none. */
  spaceLasso: Lasso | null;
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

/** Sets (or, with null, clears) the lasso; its range: the AI candidate it circles, else the lasso (005 FR-504). */
export async function setLasso(s: AppState, lasso: Lasso | null): Promise<AppState> {
  if (!lasso || lasso.length < 3 || !s.source) return { ...s, spaceLasso: null, spaceRange: null };
  const pr = await partsFor(s.source);
  const parts = pr.status === 'ok' ? pr.parts : null;
  let cuts: Uint8Array[] = [];
  if (parts && lassoCutter) {
    try {
      cuts = await lassoCutter(s.source, lassoHints(lasso));
    } catch {
      cuts = [];
    }
  }
  const { width, height } = s.source.loaded.img;
  const k = 320 / Math.max(width, height);
  const spaceRange = lassoRange(lasso, parts, cuts, parts?.w ?? Math.max(1, Math.round(width * k)), parts?.h ?? Math.max(1, Math.round(height * k)));
  return { ...s, spaceLasso: lasso, spaceRange };
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

/** The parts that, with the photo, decide the composition. */
export interface SeedKey {
  time: TimeSnapshot;
  variationIndex: number;
  spaceControls: SpaceControls;
}

const keyOf = (s: AppState): SeedKey => ({
  time: s.time,
  variationIndex: s.variationIndex,
  spaceControls: { ...s.spaceControls },
});

/** The artwork time is taken once when the app opens and then stays fixed (FR-018). */
export function createInitialState(nowMs: number, timeZone: string): AppState {
  return {
    time: snapshotNow(nowMs, timeZone),
    variationIndex: 0,
    source: null,
    previous: null,
    engineId: CURRENT_ENGINE,
    showing: 'photo',
    spaceControls: { ...DEFAULT_SPACE_CONTROLS },
    spaceType: 'auto',
    spaceSeeds: null,
    spaceWorld: null,
    spaceParts: null,
    spaceLasso: null,
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
  const next = { ...s, spaceControls };
  if (patch.featureInfluence !== undefined && patch.featureInfluence !== s.spaceControls.featureInfluence) {
    return composeSpaceState(next);
  }
  return next;
}

/** Fixing (or releasing) the world type re-renders without recomposing (FR-310). */
export function setSpaceType(s: AppState, spaceType: string): AppState {
  return { ...s, spaceType };
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
    previous: s.source ? keyOf(s) : null,
  });
  return setLasso(next, r.lasso ?? null);
}

/**
 * The photo alone, as soon as it is read (012 FR-1203): shown as it is while the AI and the world are made behind it
 * (withSource follows). No world yet, so nothing can be saved or exported.
 */
export function withPhoto(s: AppState, source: SourceState): AppState {
  return { ...s, source, engineId: CURRENT_ENGINE, showing: 'photo', previous: null, spaceLasso: null, spaceRange: null, spaceSeeds: null, spaceWorld: null, spaceParts: null };
}

/** A new photo starts a new work with the current engine: the one-step history is cleared. */
export async function withSource(s: AppState, source: SourceState): Promise<AppState> {
  return reseed({ ...s, source, engineId: CURRENT_ENGINE, showing: 'photo', previous: null, spaceLasso: null, spaceRange: null });
}

/** Seed-changing transition that remembers where it came from. */
async function changeSeed(s: AppState, patch: Partial<Pick<AppState, 'time' | 'variationIndex'>>): Promise<AppState> {
  return reseed({ ...s, ...patch, previous: s.source ? keyOf(s) : s.previous });
}

/**
 * The first action on a new photo shows the world (011 FR-1102). 「別の世界」 then shows the current variation
 * rather than skipping it; any other action (`apply`) also makes its change.
 */
export async function firstLook(s: AppState, fn: (s: AppState) => AppState | Promise<AppState>, apply = false): Promise<AppState> {
  if (s.showing === 'world') return fn(s);
  const shown: AppState = { ...s, showing: 'world' };
  return apply ? fn(shown) : shown;
}

/** 「別の世界」: same photo and time, next variation (R04). */
export function nextWorld(s: AppState): Promise<AppState> {
  return changeSeed(s, { variationIndex: s.variationIndex + 1 });
}

export function setTime(s: AppState, time: TimeSnapshot): Promise<AppState> {
  return changeSeed(s, { time });
}

/** 「現在に合わせる」 in the current time zone. */
export function syncNow(s: AppState, nowMs: number): Promise<AppState> {
  return changeSeed(s, { time: snapshotNow(nowMs, s.time.timeZone) });
}

/** 「ひとつ戻す」: one step back to before the last seed change. */
export async function restorePrevious(s: AppState): Promise<AppState> {
  if (!s.previous) return s;
  const p = s.previous;
  return reseed({ ...s, time: p.time, variationIndex: p.variationIndex, spaceControls: { ...p.spaceControls }, previous: null });
}
