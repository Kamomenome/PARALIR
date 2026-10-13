import type { Engine, EngineSeeds, EngineWorld } from '../../engines';
import { deriveSpaceSeeds, type SpaceSeeds } from './seeds';
import { SPACE_ALGORITHM_VERSIONS } from './versions';
import { composeWorld, renderWorld, type SpaceWorld, type WorldType } from './world';
import { WORLDS } from './worlds';

/** Frozen engine space-v2-1 (017): the spatial worlds as they were drawn up to ver 1.30, the portal and the darkness included. Do not change. */
export const engine: Engine = {
  id: 'space-v2-1',
  algorithms: SPACE_ALGORITHM_VERSIONS,
  worlds: WORLDS,
  seeds: deriveSpaceSeeds,
  compose: (seeds: EngineSeeds, features, controls, img, parts) => composeWorld(seeds as SpaceSeeds, features, controls, img, parts),
  render: (world: EngineWorld, img, features, controls, W, H, type, quality, parts, range) =>
    renderWorld(world as SpaceWorld, img, features, controls, W, H, (type ?? world.type) as WorldType, quality, parts ?? null, range ?? null),
};
