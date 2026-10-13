import { concatBytes, sha256, type Hex64 } from '../hash/sha256';
import type { TimeSnapshot } from '../time/snapshot';

/** [engine, pixelHash, instantEpochMs, localDateTime, timeZone, offsetMinutes, variationIndex] */
export type SeedInput = [string, string, string, string, string, number, number];

const utf8 = (s: string) => new TextEncoder().encode(s);

/** The layout of docs/REPRODUCIBILITY.md §2 with the engine's name in the first slot (space-v2). */
export function buildSeedInputFor(engine: string, pixelHash: Hex64, time: TimeSnapshot, variationIndex: number): SeedInput {
  if (!Number.isInteger(variationIndex) || variationIndex < 0) {
    throw new RangeError(`variationIndex must be a non-negative integer: ${variationIndex}`);
  }
  if (!Number.isInteger(time.offsetMinutes)) throw new RangeError('offsetMinutes must be an integer');
  return [engine, pixelHash, time.instantEpochMs, time.localDateTime, time.timeZone, time.offsetMinutes, variationIndex];
}

export function seedInputJson(si: SeedInput): string {
  return JSON.stringify(si);
}

/** Fixed-ID branch of a stream, e.g. "patch/000": SHA256(streamSeed || UTF8(id)). */
export function subStreamSeed(streamSeed: Uint8Array, id: string): Promise<Uint8Array> {
  return sha256(concatBytes(streamSeed, utf8(id)));
}
