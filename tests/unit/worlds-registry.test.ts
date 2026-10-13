import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPACE_ALGORITHM_VERSIONS } from '../../src/engine/space-v2/versions';
import { spaceStreamNames } from '../../src/engine/space-v2/seeds';
import { WORLD_TYPES, worldOdds } from '../../src/engine/space-v2/world';
import { WORLDS } from '../../src/engine/space-v2/worlds';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

describe('worlds are registered in one place (009 FR-902, SC-901)', () => {
  it('the list of worlds, in the order the seed draws from, comes from the registry', () => {
    expect(WORLDS.map((w) => w.type)).toEqual(['copies', 'dark', 'split', 'portal', 'mosaic', 'echo', 'theme']);
    expect([...WORLD_TYPES]).toEqual(WORLDS.map((w) => w.type));
    expect(worldOdds({ L: 0.5 }, true).map(([t]) => t)).toEqual(WORLDS.map((w) => w.type));
  });

  it('versions and seed streams come from the registry', () => {
    for (const w of WORLDS) expect(SPACE_ALGORITHM_VERSIONS[w.type], w.type).toBe(w.version);
    expect(Object.keys(SPACE_ALGORITHM_VERSIONS).sort()).toEqual([...WORLDS.map((w) => w.type), 'atmosphere'].sort());
    expect(spaceStreamNames()).toEqual(expect.arrayContaining(['type', 'camera', 'atmos', ...WORLDS.map((w) => w.type)]));
  });

  it('every world names itself for the screen in plain words', () => {
    for (const w of WORLDS) {
      expect(w.label.length, w.type).toBeGreaterThan(0);
      expect(w.note.length, w.type).toBeGreaterThan(0);
      expect((w.label.match(/（/g) ?? []).length, w.type).toBe(0);
    }
  });

  it("no code outside a world's folder names it (adding one touches its folder and the registry line)", () => {
    // Frozen engines and the list of engines name their worlds on purpose: they stand for what was (017).
    const src = files('src')
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !f.startsWith('src/engine/space-v2/worlds/') && !f.startsWith('src/engine/frozen/') && f !== 'src/engine/engines.ts');
    for (const w of WORLDS) {
      const outside = src.filter((f) => readFileSync(f, 'utf8').includes(`'${w.type}'`));
      expect(outside, w.type).toEqual([]);
    }
  });
});
