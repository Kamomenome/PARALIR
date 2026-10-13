import { describe, expect, it } from 'vitest';
import { checkRecipe } from '../../src/app/recipeLoad';
import { createInitialState, prepareSource, withSource } from '../../src/app/state';
import { toSpaceRecipe } from '../../src/engine/recipe';
import { makeScene } from '../helpers/images';

const source = (seed = 0, id = 1) => prepareSource(id, { name: 'scene.png', img: makeScene(64, 48, seed), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });

async function saved() {
  const s = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), await source());
  return JSON.stringify(toSpaceRecipe(s, { version: '1.26.0', commit: 'abc1234' }));
}

describe('deciding whether a recipe can be applied, outside the screen code (008 FR-811)', () => {
  it('a recipe of a removed mode is refused with the reason', async () => {
    const r = await checkRecipe(JSON.stringify({ engineVersion: 'world-v3' }), await source());
    expect(r).toEqual({ ok: false, lines: ['以前のモードの作品です。このアプリでは再現できません（world-v3）'] });
  });

  it('without a photo it asks for the photo first', async () => {
    const r = await checkRecipe(await saved(), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.lines).toEqual(['先にレシピと同じ写真を読み込んでください']);
  });

  it('another photo is refused', async () => {
    const r = await checkRecipe(await saved(), await source(1, 2));
    expect(r.ok).toBe(false);
  });

  it('the same photo gives the recipe, the id of the photo it was checked against, and the notices', async () => {
    const src = await source();
    const r = await checkRecipe(await saved(), src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sourceId).toBe(src.id);
      expect(r.recipe.engineVersion).toBe('space-v2');
      expect(Array.isArray(r.messages)).toBe(true);
    }
  });

  it('broken text is refused, never thrown', async () => {
    const r = await checkRecipe('{', await source());
    expect(r.ok).toBe(false);
  });
});
