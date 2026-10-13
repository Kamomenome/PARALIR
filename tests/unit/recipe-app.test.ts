import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, withSource } from '../../src/app/state';
import { APP_COMMIT } from '../../src/app/version';
import { parseSpaceRecipe, toSpaceRecipe } from '../../src/engine/recipe';
import { makeScene } from '../helpers/images';

async function recipe(app?: { version: string; commit: string }) {
  const src = await prepareSource(1, { name: 'scene.png', img: makeScene(64, 48), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
  const s = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
  return JSON.parse(JSON.stringify(toSpaceRecipe(s, app)));
}

describe('a recipe says which app made it (008 FR-802, SC-802)', () => {
  it('writes the app version and commit, and they load', async () => {
    const r = await recipe({ version: '1.26.0', commit: 'abc1234' });
    expect(r.app).toEqual({ version: '1.26.0', commit: 'abc1234' });
    expect(parseSpaceRecipe(JSON.stringify(r)).ok).toBe(true);
    const schema = JSON.parse(readFileSync('specs/003-space-worlds/contracts/space-v2-recipe.schema.json', 'utf8'));
    expect(Object.keys(schema.properties)).toContain('app');
  });

  it('the quality written is what the export does: one sample per pixel (008 FR-817)', async () => {
    expect((await recipe()).output.qualityMode).toBe('standard');
  });

  it('the commit is known when the app is built or tested', () => {
    expect(APP_COMMIT).toMatch(/^[0-9a-f]{7,40}(-dirty)?$/);
  });

  it('recipes saved before 008 (no app) still load', async () => {
    const r = await recipe();
    expect('app' in r).toBe(false);
    expect(parseSpaceRecipe(JSON.stringify(r)).ok).toBe(true);
  });

  it('a recipe from other world versions is refused with the version to open it in', async () => {
    const r = await recipe({ version: '1.25.0', commit: 'abc1234' });
    r.algorithms.copies = 'copies-v3';
    const p = parseSpaceRecipe(JSON.stringify(r));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.errors[0]).toBe('ver 1.25（commit abc1234）で保存された作品です。その版の PARALIR で開くと再現できます');
  });

  it('a malformed app record is refused', async () => {
    const r = await recipe({ version: '1.26.0', commit: 'abc1234' });
    r.app = { version: 'x', commit: '<b>' };
    expect(parseSpaceRecipe(JSON.stringify(r)).ok).toBe(false);
  });
});
