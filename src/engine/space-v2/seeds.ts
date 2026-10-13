import { concatBytes, sha256, toHex, type Hex64 } from '../common/hash/sha256';
import { buildSeedInputFor, seedInputJson, type SeedInput } from '../common/seed/seeds';
import type { TimeSnapshot } from '../common/time/snapshot';
import type { WorldType } from './world';
import { WORLDS } from './worlds';

export const SPACE_ENGINE = 'space-v2';
/** The streams: the world's type, the camera, the background, and one per registered world (009 FR-902). */
export type SpaceStream = 'type' | 'camera' | 'atmos' | WorldType;

/** Read when seeds are made, not when the module loads: the worlds import the draws, and the registry imports the worlds. */
export function spaceStreamNames(): SpaceStream[] {
  return ['type', 'camera', 'atmos', ...WORLDS.map((w) => w.type)];
}

export interface SpaceSeeds {
  seedInput: SeedInput;
  rootSeed: Hex64;
  streams: Record<SpaceStream, Uint8Array>;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

export function buildSpaceSeedInput(pixelHash: Hex64, time: TimeSnapshot, variationIndex: number): SeedInput {
  return buildSeedInputFor(SPACE_ENGINE, pixelHash, time, variationIndex);
}

/** rootSeed = SHA256(UTF8(JSON)), stream = SHA256(root || UTF8(name)), as in docs/REPRODUCIBILITY.md §2–3. */
export async function deriveSpaceSeeds(seedInput: SeedInput): Promise<SpaceSeeds> {
  const root = await sha256(utf8(seedInputJson(seedInput)));
  const entries = await Promise.all(spaceStreamNames().map(async (n) => [n, await sha256(concatBytes(root, utf8(n)))] as const));
  return { seedInput, rootSeed: toHex(root), streams: Object.fromEntries(entries) as Record<SpaceStream, Uint8Array> };
}

// The helpers worlds draw with live in draws.ts, so a world never imports this file (which reads the registry).
export { drawsFrom, generatorFor } from './draws';
