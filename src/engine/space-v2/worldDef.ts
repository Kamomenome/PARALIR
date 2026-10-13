import type { ImageFeatures } from '../common/analysis/features';
import type { RgbImage } from '../common/image/normalize';
import type { PhotoParts } from '../common/parts/types';
import type { LightShape } from './shared/atmosphere';
import type { PhotoObject } from './shared/object';
import type { SpaceSeeds } from './seeds';
import type { SpaceControls } from './types';
import type { SpaceWorld, WorldRender } from './world';

/** What a world is built from: the seeds, the photo, and the camera's field of view. */
export interface ComposeContext {
  seeds: SpaceSeeds;
  features: ImageFeatures;
  img: RgbImage;
  fov: number;
}

/** What a world is drawn with. `ranged()` is the lasso's range, else the estimate the user liked (005 FR-504). */
export interface RenderContext {
  world: SpaceWorld;
  img: RgbImage;
  features: ImageFeatures;
  controls: SpaceControls;
  W: number;
  H: number;
  quality: number;
  parts: PhotoParts | null;
  obj: PhotoObject;
  ranged(): PhotoObject;
}

/**
 * One world, all in its own folder (009 FR-902): its name on screen, its odds, how it is built from the seed and
 * how it is drawn. Register it with one line in worlds/index.ts.
 */
export interface WorldDef<T extends string = string, P = unknown> {
  readonly type: T;
  /** The short name in the world select. */
  readonly label: string;
  /** One line under the select saying what the world does. */
  readonly note: string;
  /** Raise it whenever the world's output changes (and record the pixels again). */
  readonly version: string;
  /** The sliders that change this world (017 FR-1704); 写真に合わせる強さ works in every world and is not listed (nor shown, 019). */
  readonly controls: readonly ('light' | 'lightShape' | 'size' | 'count' | 'darkness')[];
  /** The light's shape drawn for the work, where 光の形 is a control (019 FR-1908): the slider starts there. */
  shapeOf?(world: SpaceWorld): LightShape;
  /** The lasso's range is used (017 FR-1706). */
  readonly usesRange?: boolean;
  /** Only for photos with a subject: never drawn without one, and not offered on screen. */
  readonly needsSubject?: boolean;
  /** Weight in おまかせ's draw; `light` is the photo's brightness in [0,1]. */
  odds(light: number, hasSubject: boolean): number;
  build(ctx: ComposeContext): Promise<P>;
  render(ctx: RenderContext): WorldRender;
}
