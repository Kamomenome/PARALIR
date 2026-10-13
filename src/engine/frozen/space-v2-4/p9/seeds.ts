import { concatBytes, sha256, toHex, type Hex64 } from '../../../common/hash/sha256';
import { Seeded32 } from '../../../common/prng/seeded32';
import { buildSeedInputFor, seedInputJson, subStreamSeed, type SeedInput } from '../../../common/seed/seeds';
import type { TimeSnapshot } from '../../../common/time/snapshot';

export const SPACE_ENGINE = 'space-v1';
export const SPACE_STREAMS = ['camera', 'flame', 'growth', 'parts', 'color', 'look'] as const;
export type SpaceStream = (typeof SPACE_STREAMS)[number];

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
  const entries = await Promise.all(SPACE_STREAMS.map(async (n) => [n, await sha256(concatBytes(root, utf8(n)))] as const));
  return { seedInput, rootSeed: toHex(root), streams: Object.fromEntries(entries) as Record<SpaceStream, Uint8Array> };
}

/** `count` uniforms from the fixed sub-stream `id` of `stream`. */
export async function drawsFrom(stream: Uint8Array, id: string, count: number): Promise<number[]> {
  const r = new Seeded32(await subStreamSeed(stream, id));
  return Array.from({ length: count }, () => r.next());
}

export async function generatorFor(stream: Uint8Array, id: string): Promise<Seeded32> {
  return new Seeded32(await subStreamSeed(stream, id));
}
