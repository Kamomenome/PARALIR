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
 */
export interface Engine {
  id: string;
  algorithms: Readonly<Record<string, string>>;
  worlds: readonly { type: string; label: string; note: string; needsSubject?: boolean }[];
  seeds(seedInput: SeedInput): Promise<EngineSeeds>;
  compose(seeds: EngineSeeds, features: ImageFeatures, img: RgbImage, parts: PhotoParts | null): Promise<EngineWorld>;
  render(world: EngineWorld, img: RgbImage, features: ImageFeatures, controls: SpaceControls, W: number, H: number, type?: string, quality?: number, parts?: PhotoParts | null, range?: ThemeRange | null): { rgba: Uint8ClampedArray };
}

/** The engine works are composed and drawn with: there is one since recipes went (020 FR-2002). */
export const ENGINE: Engine = spaceV2;
export const CURRENT_ENGINE = spaceV2.id;
