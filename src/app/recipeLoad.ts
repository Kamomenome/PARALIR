import { parseSpaceRecipe, partsNotice, recipeEngineOf, verifySpaceRecipe, type SpaceRecipe } from '../engine/recipe';
import { engineFor } from '../engine/engines';
import { partsFor, type SourceState } from './state';

export type RecipeCheck =
  | { ok: false; lines: string[] }
  /** Apply only while the photo is still `sourceId` (008 FR-811). */
  | { ok: true; recipe: SpaceRecipe; engineId: string; sourceId: number; messages: string[] };

/** A saved recipe is a few kilobytes (008 FR-814). */
export const MAX_RECIPE_BYTES = 1024 * 1024;
export const RECIPE_TOO_LARGE = 'レシピのファイルが大きすぎます（上限 1 MiB）';

/** Whether a loaded recipe can be applied to the photo on screen, and what to tell the user (R10, 006 FR-604, 008 FR-811). */
export async function checkRecipe(text: string, source: SourceState | null): Promise<RecipeCheck> {
  if (text.length > MAX_RECIPE_BYTES) return { ok: false, lines: [RECIPE_TOO_LARGE] };
  const engine = recipeEngineOf(text);
  // Works of the removed modes are not re-drawn another way (006 FR-604).
  if (engine === 'world-v3' || engine === 'reference-v1' || engine === 'space-v1') {
    return { ok: false, lines: [`以前のモードの作品です。このアプリでは再現できません（${engine}）`] };
  }
  const sp = parseSpaceRecipe(text);
  if (!sp.ok) return { ok: false, lines: ['このレシピは読み込めません', ...sp.errors.slice(0, 6)] };
  if (!source) return { ok: false, lines: ['先にレシピと同じ写真を読み込んでください'] };
  const sv = await verifySpaceRecipe(sp.recipe, source);
  if (sv.status !== 'ok') return { ok: false, lines: sv.messages };
  const pr = await partsFor(source);
  const notice = partsNotice(sp.recipe.parts, pr.status === 'ok' ? pr.parts.digest : null);
  // Parsing succeeded, so an engine with these versions is in the list (009 FR-905).
  return { ok: true, recipe: sp.recipe, engineId: engineFor(sp.recipe.algorithms)!.id, sourceId: source.id, messages: [...sv.messages, ...notice] };
}
