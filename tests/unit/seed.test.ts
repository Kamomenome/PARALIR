import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pixelHash, toHex } from '../../src/engine/common/hash/sha256';
import { seedInputJson, subStreamSeed } from '../../src/engine/common/seed/seeds';
import { buildSpaceSeedInput, deriveSpaceSeeds, spaceStreamNames } from '../../src/engine/space-v2/seeds';
import type { TimeSnapshot } from '../../src/engine/common/time/snapshot';
import { readPngRgb } from '../helpers/png';

const time: TimeSnapshot = {
  instantEpochMs: '1791689696789',
  localDateTime: '2026-10-11T12:34:56.789',
  timeZone: 'Asia/Tokyo',
  offsetMinutes: 540,
  resolution: 'exact',
};
const PIXEL = 'ab'.repeat(32);

const sha = (...parts: (Buffer | string)[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};

describe('seedInput of the spatial mode (docs/REPRODUCIBILITY.md §2, space-v2)', () => {
  it('has the fixed order and JSON form', () => {
    const si = buildSpaceSeedInput(PIXEL, time, 3);
    expect(si).toEqual(['space-v2', PIXEL, '1791689696789', '2026-10-11T12:34:56.789', 'Asia/Tokyo', 540, 3]);
    expect(seedInputJson(si)).toBe(`["space-v2","${PIXEL}","1791689696789","2026-10-11T12:34:56.789","Asia/Tokyo",540,3]`);
  });

  it('rejects non-integer or negative variation indices', () => {
    expect(() => buildSpaceSeedInput(PIXEL, time, 1.5)).toThrow();
    expect(() => buildSpaceSeedInput(PIXEL, time, -1)).toThrow();
  });
});

describe('deriveSpaceSeeds (008: an independent check of the live seeds)', () => {
  it('rootSeed and stream seeds match an independent computation', async () => {
    const si = buildSpaceSeedInput(PIXEL, time, 0);
    const s = await deriveSpaceSeeds(si);
    const root = sha(Buffer.from(seedInputJson(si), 'utf8'));
    expect(s.rootSeed).toBe(root.toString('hex'));
    for (const name of spaceStreamNames()) expect(toHex(s.streams[name])).toBe(sha(root, Buffer.from(name, 'utf8')).toString('hex'));
  });

  it('sub-streams are SHA256(streamSeed || UTF8(id)) and do not disturb other streams', async () => {
    const s = await deriveSpaceSeeds(buildSpaceSeedInput(PIXEL, time, 0));
    const before = toHex(s.streams.camera);
    const sub = await subStreamSeed(s.streams.mosaic, 'mosaic/000');
    expect(toHex(sub)).toBe(sha(Buffer.from(s.streams.mosaic), 'mosaic/000').toString('hex'));
    expect(toHex(s.streams.camera)).toBe(before);
  });

  it('changes with the variation index and the time', async () => {
    const a = await deriveSpaceSeeds(buildSpaceSeedInput(PIXEL, time, 0));
    const b = await deriveSpaceSeeds(buildSpaceSeedInput(PIXEL, time, 1));
    const c = await deriveSpaceSeeds(buildSpaceSeedInput(PIXEL, { ...time, instantEpochMs: '1791689696790' }, 0));
    expect(new Set([a.rootSeed, b.rootSeed, c.rootSeed]).size).toBe(3);
  });
});

describe('pixel content, not file bytes, decides the seed (FR-006)', () => {
  it('two PNGs that differ only in metadata give the same pixelHash and rootSeed', async () => {
    const fa = readFileSync('tests/fixtures/images/same-pixels-a.png');
    const fb = readFileSync('tests/fixtures/images/same-pixels-b.png');
    expect(sha(fa).equals(sha(fb))).toBe(false);
    const pa = await pixelHash(readPngRgb('tests/fixtures/images/same-pixels-a.png'));
    const pb = await pixelHash(readPngRgb('tests/fixtures/images/same-pixels-b.png'));
    expect(pa).toBe(pb);
    const ra = await deriveSpaceSeeds(buildSpaceSeedInput(pa, time, 0));
    const rb = await deriveSpaceSeeds(buildSpaceSeedInput(pb, time, 0));
    expect(ra.rootSeed).toBe(rb.rootSeed);
  });
});
