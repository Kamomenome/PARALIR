import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/engine/common/analysis/features';
import { pixelHash } from '../../src/engine/common/hash/sha256';
import { composeSpace, renderSpace } from '../../src/engine/space-v2/p9/composite';
import { buildSpaceSeedInput, deriveSpaceSeeds } from '../../src/engine/space-v2/p9/seeds';
import { DEFAULT_SPACE_CONTROLS } from '../../src/engine/space-v2/p9/types';
import { snapshotFromLocal } from '../../src/engine/common/time/snapshot';
import { readPngRgb } from '../helpers/png';

const fixture = JSON.parse(readFileSync('tests/fixtures/phase9-hashes.json', 'utf8'));

describe('the restored 002 Phase 9 renderer draws the liked pictures (005 FR-501, SC-501)', () => {
  // The liked pictures were drawn from a real photo, which is kept out of the repository (009 FR-922): this runs where
  // the photo is (samples/reference/, not in git) and is skipped elsewhere, e.g. in CI.
  it.skipIf(!existsSync(fixture.input))('the 16 liked cells, pixel for pixel', { timeout: 600_000 }, async () => {
    const img = readPngRgb(fixture.input);
    const features = analyze(img);
    const hash = await pixelHash(img);
    const time = snapshotFromLocal('2026-10-11T12:00', 'Asia/Tokyo');
    const controls = { ...DEFAULT_SPACE_CONTROLS };
    for (const cell of fixture.cells) {
      const seeds = await deriveSpaceSeeds(buildSpaceSeedInput(hash, time, cell.variation));
      expect(seeds.rootSeed, `${cell.foreground} v${cell.variation} seed`).toBe(cell.rootSeed);
      const comp = await composeSpace(seeds, features, controls, img);
      const { rgba } = renderSpace(comp, img, features, controls, 'composite', cell.width, cell.height, {
        quality: cell.quality,
        pipeline: cell.pipeline,
      });
      expect(createHash('sha256').update(rgba).digest('hex'), `${cell.foreground} v${cell.variation}`).toBe(cell.rgbaSha256);
    }
  });
});
