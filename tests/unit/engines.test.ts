import { afterEach, describe, expect, it } from 'vitest';
import { jobFor } from '../../src/app/export';
import { checkRecipe } from '../../src/app/recipeLoad';
import { applySpaceRecipe, createInitialState, nextWorld, prepareSource, withSource } from '../../src/app/state';
import { CURRENT_ENGINE, loadEngine, registerEngine, unregisterEngine, type Engine } from '../../src/engine/engines';
import { toSpaceRecipe } from '../../src/engine/recipe';
import { createHandler } from '../../src/worker/handler';
import '../../src/worker/modes';
import { makeScene } from '../helpers/images';

const OLD = 'test-frozen';

/** A frozen engine as a later version would leave behind: the same worlds, other versions, its own drawing. */
async function registerOld() {
  const live = await loadEngine(CURRENT_ENGINE);
  const algorithms = { ...live.algorithms, copies: 'copies-v3' };
  let loaded = 0;
  const old: Engine = { ...live, id: OLD, algorithms, render: (...a) => ({ ...live.render(...a), rgba: new Uint8ClampedArray(a[4] * a[5] * 4).fill(7) }) };
  registerEngine({ id: OLD, algorithms, worldTypes: live.worlds.map((w) => w.type), load: async () => (loaded++, old) });
  return { algorithms, loads: () => loaded };
}

async function photo() {
  const src = await prepareSource(1, { name: 'scene.png', img: makeScene(64, 48), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
  return { src, s: await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src) };
}

describe('works saved with an older engine open with that engine (009 FR-904, FR-905, SC-902)', () => {
  afterEach(() => unregisterEngine(OLD));

  it('a new photo uses the current engine', async () => {
    const { s } = await photo();
    expect(s.engineId).toBe(CURRENT_ENGINE);
    expect(jobFor(s, 'preview', 8, 6).mode).toBe(CURRENT_ENGINE);
  });

  it("a recipe with a frozen engine's versions is accepted, applied with it, drawn with it, and saved again the same", async () => {
    const { algorithms, loads } = await registerOld();
    const { src, s } = await photo();
    const recipe = toSpaceRecipe(await nextWorld(s));
    recipe.algorithms = algorithms;
    const check = await checkRecipe(JSON.stringify(recipe), src);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.engineId).toBe(OLD);
    const t = await applySpaceRecipe(s, check.recipe, check.engineId);
    expect(t.engineId).toBe(OLD);
    expect(loads()).toBeGreaterThan(0);
    expect(toSpaceRecipe(t).algorithms).toEqual(algorithms);
    // The worker loads the frozen engine by its id and draws with it.
    const job = jobFor(t, 'preview', 8, 6);
    expect(job.mode).toBe(OLD);
    const posted: any[] = [];
    const handle = createHandler((m) => posted.push(m));
    handle({ type: 'setSource', sourceId: 1, img: src.loaded.img, features: src.features });
    handle({ type: 'render', jobId: 1, sourceId: 1, mode: job.mode, payload: job.payload, W: 8, H: 6 });
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].type).toBe('frame');
    expect([...posted[0].pixels.slice(0, 4)]).toEqual([7, 7, 7, 7]);
  });

  it('a recipe whose versions no engine has is refused', async () => {
    const { src, s } = await photo();
    const recipe = toSpaceRecipe(s);
    recipe.algorithms = { ...recipe.algorithms, copies: 'copies-v1' };
    const check = await checkRecipe(JSON.stringify(recipe), src);
    expect(check.ok).toBe(false);
  });
});
