import { ATMOSPHERE_VERSION } from './shared/atmosphere';
import { WORLDS } from './worlds';

/**
 * The versions of this engine's parts, from the registry (009 FR-902): raise a world's `version` whenever its
 * output changes, after freezing the engine (CONTRIBUTING.md). Saved recipes carry them.
 */
export const SPACE_ALGORITHM_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(WORLDS.map((w) => [w.type, w.version])),
  atmosphere: ATMOSPHERE_VERSION,
});
