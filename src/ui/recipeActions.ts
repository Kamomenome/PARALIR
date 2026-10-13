import { saveBlob, workName } from '../app/export';
import { checkRecipe } from '../app/recipeLoad';
import { applySpaceRecipe } from '../app/state';
import { APP_RECORD } from '../app/version';
import { toSpaceRecipe } from '../engine/recipe';
import type { AppContext } from './context';
import type { RecipePanel } from './recipePanel';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Saving and loading recipes (R10, 008 FR-811). */
export function wireRecipes(ctx: AppContext, panel: RecipePanel): void {
  panel.onSave(() => {
    const state = ctx.state();
    try {
      const json = JSON.stringify(toSpaceRecipe(state, APP_RECORD), null, 2);
      saveBlob(new Blob([json], { type: 'application/json' }), `${workName(state)}.json`);
      panel.setStatus(['レシピを保存しました。再現には同じ写真が必要です']);
    } catch (e) {
      panel.setStatus([`保存できません: ${message(e)}`], 'error');
    }
  });

  panel.onLoad(async (text) => {
    try {
      const check = await checkRecipe(text, ctx.state().source);
      if (!check.ok) {
        panel.setStatus(check.lines, 'error');
        return;
      }
      // Applied in turn with every other change, and only to the photo it was checked against (008 FR-811).
      ctx.update(async (s) => {
        if (s.source?.id !== check.sourceId) {
          panel.setStatus(['写真が替わったため、レシピを当てはめませんでした。もう一度読み込んでください'], 'error');
          return s;
        }
        const next = await applySpaceRecipe(s, check.recipe, check.engineId);
        panel.setStatus(['レシピを読み込みました', ...check.messages]);
        return next;
      });
    } catch (e) {
      panel.setStatus([`レシピを読み込めません: ${message(e)}`], 'error');
    }
  });
}
