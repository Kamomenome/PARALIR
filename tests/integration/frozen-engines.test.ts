import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { engineEntry, loadEngine } from '../../src/engine/engines';
import { currentVersions, drawWorldCells } from '../helpers/worlds';

// The frozen engines draw exactly what they drew when they were frozen (009 FR-905, 017 SC-1701).
describe.each(['space-v2-1', 'space-v2-2'])('the frozen engine %s', (engineId) => {
  it('the list says what the engine is (its versions and worlds), so recipes find it without loading it', async () => {
    const engine = await loadEngine(engineId);
    expect(engine.id).toBe(engineId);
    expect(engineEntry(engineId)!.algorithms).toEqual(engine.algorithms);
    expect(engineEntry(engineId)!.worldTypes).toEqual(engine.worlds.map((w) => w.type));
  });

  it('draws every pinned cell, pixel for pixel (the portal and the darkness included)', { timeout: 600_000 }, async () => {
    const fixture = JSON.parse(readFileSync(`tests/fixtures/world-hashes-${engineId}.json`, 'utf8'));
    expect(currentVersions(engineId)).toEqual(fixture.versions);
    const cells = await drawWorldCells(engineId);
    expect(cells.map((c) => `${c.world}/${c.variation}/${c.lasso}/${c.rgbaSha256}`)).toEqual(fixture.cells.map((c: any) => `${c.world}/${c.variation}/${c.lasso}/${c.rgbaSha256}`));
  });
});
