import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySpaceRecipe, createInitialState, nextWorld, prepareSource, setSpaceControls, setSpaceType, withSource, type AppState } from '../../src/app/state';
import { parseSpaceRecipe, recipeEngineOf, toSpaceRecipe, verifySpaceRecipe } from '../../src/engine/recipe';
import { SPACE_CONTROL_KEYS } from '../../src/engine/space-v2/types';
import { SPACE_ALGORITHM_VERSIONS } from '../../src/engine/space-v2/versions';
import { WORLD_TYPES, renderWorld, type SpaceWorld, type WorldType } from '../../src/engine/space-v2/world';
import { makeScene } from '../helpers/images';

async function spaceState(img = makeScene(64, 48), id = 1): Promise<AppState> {
  const s0 = createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo');
  const src = await prepareSource(id, { name: 'scene.png', img, fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
  return withSource(s0, src);
}

const small = (s: AppState) => renderWorld(s.spaceWorld! as SpaceWorld, s.source!.loaded.img, s.source!.features, s.spaceControls, 80, 60, s.spaceType === 'auto' ? undefined : (s.spaceType as WorldType)).rgba;

describe('space-v2 state (003 US2)', () => {
  it('a photo composes a world (the only mode, 006); another world changes the seed', async () => {
    const s = await spaceState();
    expect((s.spaceWorld as SpaceWorld | null)?.engineVersion).toBe('space-v2');
    expect(s.spaceSeeds?.seedInput[0]).toBe('space-v2');
    const t = await nextWorld(s);
    expect(t.spaceSeeds?.rootSeed).not.toBe(s.spaceSeeds?.rootSeed);
  });

  it('fixing a world type and moving sliders keep the composition (FR-309, FR-310)', async () => {
    const s = await spaceState();
    const t = setSpaceType(s, 'dark');
    expect(t.spaceWorld).toBe(s.spaceWorld);
    const u = await setSpaceControls(t, { light: 0.9, size: 0.2, count: 0.8, darkness: 0.1 });
    expect(u.spaceWorld).toBe(s.spaceWorld);
    expect(u.spaceSeeds).toBe(s.spaceSeeds);
  });
});

describe('space-v2 recipe (003 US3, FR-311)', () => {
  it('save → load with the same photo → identical render', async () => {
    const s = setSpaceType(await setSpaceControls(await nextWorld(await spaceState()), { light: 0.7 }), 'copies');
    const parsed = parseSpaceRecipe(JSON.stringify(toSpaceRecipe(s)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.recipe.algorithms).toEqual(SPACE_ALGORITHM_VERSIONS);
    expect(parsed.recipe.worldType).toBe('copies');
    const fresh = await spaceState(makeScene(64, 48), 2);
    expect((await verifySpaceRecipe(parsed.recipe, fresh.source!)).status).toBe('ok');
    const restored = await applySpaceRecipe(fresh, parsed.recipe);
    expect(Buffer.compare(Buffer.from(small(restored)), Buffer.from(small(s)))).toBe(0);
  });

  it('refuses space-v1 recipes with the reason, and unknown versions and values', async () => {
    const s = await spaceState();
    const r = toSpaceRecipe(s);
    const v1 = { ...JSON.parse(JSON.stringify(r)), engineVersion: 'space-v1', schemaVersion: 7 };
    expect(recipeEngineOf(JSON.stringify(v1))).toBe('space-v1');
    const p1 = parseSpaceRecipe(JSON.stringify(v1));
    expect(p1.ok).toBe(false);
    if (!p1.ok) expect(p1.errors.join(' ')).toContain('以前の空間モード');
    const bad = JSON.parse(JSON.stringify(r));
    bad.algorithms.copies = 'copies-v9';
    expect(parseSpaceRecipe(JSON.stringify(bad)).ok).toBe(false);
    const badType = JSON.parse(JSON.stringify(r));
    badType.worldType = 'nebula';
    expect(parseSpaceRecipe(JSON.stringify(badType)).ok).toBe(false);
    const other = await spaceState(makeScene(64, 48, 1), 3);
    expect((await verifySpaceRecipe(r, other.source!)).status).toBe('different-image');
  });

  it('matches its contract (contracts/space-v2-recipe.schema.json)', async () => {
    const schema = JSON.parse(readFileSync('specs/003-space-worlds/contracts/space-v2-recipe.schema.json', 'utf8'));
    const r = toSpaceRecipe(await spaceState());
    // Every required key is written, and every key written is in the contract (parts is optional, 004).
    for (const k of schema.required) expect(Object.keys(r)).toContain(k);
    for (const k of Object.keys(r)) expect(Object.keys(schema.properties)).toContain(k);
    expect(schema.properties.engineVersion.const).toBe('space-v2');
    expect([...schema.properties.algorithms.required].sort()).toEqual(Object.keys(SPACE_ALGORITHM_VERSIONS).sort());
    expect([...schema.properties.controls.required].sort()).toEqual([...SPACE_CONTROL_KEYS].sort());
    expect(schema.properties.worldType.enum).toEqual(['auto', ...WORLD_TYPES]);
  });
});
