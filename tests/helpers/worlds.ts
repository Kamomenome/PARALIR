// The 7 worlds drawn the way the app draws them (the worker's renderer, jobFor's payload), from a fixed photo,
// time and size with the AI off, so their pixels can be pinned (008 FR-801).
import { createHash } from 'node:crypto';
import { jobFor } from '../../src/app/export';
import { createInitialState, nextWorld, prepareSource, setLasso, setSpaceType, withSource, type AppState } from '../../src/app/state';
import type { Lasso } from '../../src/engine/common/parts/lasso';
import { SPACE_ALGORITHM_VERSIONS } from '../../src/engine/space-v2/versions';
import { WORLD_TYPES, type WorldType } from '../../src/engine/space-v2/world';
import { getRenderer } from '../../src/worker/renderers';
import '../../src/worker/modes';
import { readPngRgb } from './png';

export const WORLD_PIN = {
  input: 'tests/fixtures/images/scene.png',
  /** 2026-10-11 12:00 in Tokyo. */
  epochMs: Date.UTC(2026, 9, 11, 3),
  timeZone: 'Asia/Tokyo',
  width: 160,
  height: 120,
  /** Variations 0..5 of every world: enough seeds that each light shape (ring, edge, band) is drawn. */
  variations: 6,
  lasso: [[0.3, 0.3], [0.62, 0.28], [0.66, 0.62], [0.32, 0.66]] as Lasso,
};

export interface WorldCell {
  world: WorldType;
  variation: number;
  lasso: boolean;
  rgbaSha256: string;
}

function draw(s: AppState): string {
  const { width: W, height: H } = WORLD_PIN;
  // The world, not the photo shown as it is before the first action (011).
  const job = jobFor({ ...s, showing: 'world' }, 'preview', W, H);
  const src = s.source!;
  const out = getRenderer(job.mode)!({ src: src.loaded.img, features: src.features, payload: job.payload, W, H });
  return createHash('sha256').update(out).digest('hex');
}

/** Every world at variations 0..5, and the theme world with a lasso. */
export async function drawWorldCells(): Promise<WorldCell[]> {
  const img = readPngRgb(WORLD_PIN.input);
  const source = await prepareSource(1, { name: 'scene.png', img, fileSha256: '0'.repeat(64) as any, fileBytes: 0, hadTransparency: false });
  const v0 = await withSource(createInitialState(WORLD_PIN.epochMs, WORLD_PIN.timeZone), source);
  const cells: WorldCell[] = [];
  let s = v0;
  for (let variation = 0; variation < WORLD_PIN.variations; variation++) {
    for (const world of WORLD_TYPES) cells.push({ world, variation, lasso: false, rgbaSha256: draw(setSpaceType(s, world)) });
    s = await nextWorld(s);
  }
  const lassoed = await setLasso(setSpaceType(v0, 'theme'), WORLD_PIN.lasso);
  cells.push({ world: 'theme', variation: 0, lasso: true, rgbaSha256: draw(lassoed) });
  return cells;
}

export const currentVersions = () => ({ ...SPACE_ALGORITHM_VERSIONS });
