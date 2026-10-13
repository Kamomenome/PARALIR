import { describe, expect, it } from 'vitest';
import { checkRecipe } from '../../src/app/recipeLoad';
import { applySpaceRecipe, createInitialState, prepareSource, reseed, setSpaceType, withSource } from '../../src/app/state';
import { CURRENT_ENGINE, engineEntry } from '../../src/engine/engines';
import { toSpaceRecipe } from '../../src/engine/recipe';
import { WORLDS } from '../../src/engine/space-v2/worlds';
import { makeScene } from '../helpers/images';

describe('the portal and the darkness are gone; their works still open (017 FR-1703, SC-1702)', () => {
  it('the current engine has five worlds', () => {
    expect(WORLDS.map((w) => w.type)).toEqual(['copies', 'split', 'mosaic', 'echo', 'theme']);
    expect(engineEntry(CURRENT_ENGINE)!.worldTypes).not.toContain('portal');
  });

  it('a portal work saved with the frozen engine opens with it', async () => {
    const src = await prepareSource(1, { name: 'scene.png', img: makeScene(64, 48), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
    const fresh = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
    const old = setSpaceType(await reseed({ ...fresh, engineId: 'space-v2-1' }), 'portal');
    const recipe = JSON.stringify(toSpaceRecipe(old));
    const check = await checkRecipe(recipe, src);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.engineId).toBe('space-v2-1');
    const opened = await applySpaceRecipe(fresh, check.recipe, check.engineId);
    expect(opened.spaceType).toBe('portal');
    expect(opened.engineId).toBe('space-v2-1');
  });
});
