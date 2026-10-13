import type { ImageFeatures } from './common/analysis/features';
import type { RgbImage } from './common/image/normalize';
import type { ThemeRange } from './common/parts/lasso';
import type { PhotoParts } from './common/parts/types';
import type { SeedInput } from './common/seed/seeds';
import { engine as spaceV2 } from './space-v2';
import type { SpaceControls } from './space-v2/types';

/** What the app needs to know of a composed world; the rest is the engine's own. */
export interface EngineWorld {
  type: string;
  hasSubject: boolean;
}

/** The seeds an engine composes from. */
export interface EngineSeeds {
  seedInput: SeedInput;
  rootSeed: string;
}

/**
 * A way of drawing, whole: how it is seeded, composed and rendered, and the versions it stands for (009 FR-904).
 * A version change freezes the current engine (CONTRIBUTING.md), so works saved with it still open the same.
 */
export interface Engine {
  id: string;
  algorithms: Readonly<Record<string, string>>;
  worlds: readonly { type: string; label: string; note: string; needsSubject?: boolean }[];
  seeds(seedInput: SeedInput): Promise<EngineSeeds>;
  compose(seeds: EngineSeeds, features: ImageFeatures, controls: SpaceControls, img: RgbImage, parts: PhotoParts | null): Promise<EngineWorld>;
  render(world: EngineWorld, img: RgbImage, features: ImageFeatures, controls: SpaceControls, W: number, H: number, type?: string, quality?: number, parts?: PhotoParts | null, range?: ThemeRange | null): { rgba: Uint8ClampedArray };
}

/** An engine in the list: known by its versions without loading it; frozen ones load only when a work needs them. */
export interface EngineEntry {
  id: string;
  algorithms: Readonly<Record<string, string>>;
  worldTypes: readonly string[];
  load(): Promise<Engine>;
}

/** The engine new works use. */
export const CURRENT_ENGINE = spaceV2.id;

const entries: EngineEntry[] = [
  { id: spaceV2.id, algorithms: spaceV2.algorithms, worldTypes: spaceV2.worlds.map((w) => w.type), load: async () => spaceV2 },
  // Frozen engines, newest first (CONTRIBUTING.md). Their versions are written here so a recipe finds its engine without loading it.
  {
    // Up to ver 1.30: the portal and the darkness included (017 FR-1703).
    id: 'space-v2-1',
    algorithms: { copies: 'copies-v4', dark: 'dark-v4', split: 'split-v4', portal: 'portal-v2', mosaic: 'mosaic-v2', echo: 'echo-v1', theme: 'theme-v2', atmosphere: 'atmosphere-v2' },
    worldTypes: ['copies', 'dark', 'split', 'portal', 'mosaic', 'echo', 'theme'],
    load: () => import('./frozen/space-v2-1').then((m) => m.engine),
  },
];

export function engineEntry(id: string): EngineEntry | undefined {
  return entries.find((e) => e.id === id);
}

const same = (a: Readonly<Record<string, string>>, b: unknown) =>
  !!b && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => (b as Record<string, unknown>)[k] === v);

/** The engine whose versions are exactly these, if any. */
export function engineFor(algorithms: unknown): EngineEntry | undefined {
  return entries.find((e) => same(e.algorithms, algorithms));
}

const loaded = new Map<string, Promise<Engine>>();

export function loadEngine(id: string): Promise<Engine> {
  const entry = engineEntry(id);
  if (!entry) return Promise.reject(new Error(`描き方（エンジン ${id}）がありません`));
  let p = loaded.get(id);
  if (!p) {
    p = entry.load();
    loaded.set(id, p);
    p.catch(() => loaded.delete(id));
  }
  return p;
}

/** For tests: list another (e.g. a frozen) engine. */
export function registerEngine(entry: EngineEntry): void {
  unregisterEngine(entry.id);
  entries.push(entry);
}

export function unregisterEngine(id: string): void {
  const i = entries.findIndex((e) => e.id === id && id !== CURRENT_ENGINE);
  if (i >= 0) entries.splice(i, 1);
  loaded.delete(id);
}
