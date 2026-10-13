import { MAX_RECIPE_BYTES, RECIPE_TOO_LARGE } from '../app/recipeLoad';
import { h } from './layout';

export interface RecipePanel {
  /** Saving sits next to exporting: it keeps a liked picture reproducible. */
  saveRoot: HTMLElement;
  status: HTMLElement;
  /** Loading sits in 詳しい設定 (007 FR-703). */
  loadRoot: HTMLElement;
  onSave(fn: () => void): void;
  onLoad(fn: (text: string) => void): void;
  setSaveEnabled(enabled: boolean): void;
  setStatus(lines: string[], kind?: 'info' | 'error'): void;
}

/** Save / load versioned JSON recipes (R10). */
export function buildRecipePanel(): RecipePanel {
  const save = h('button', { 'data-testid': 'recipe-save', disabled: '' }, 'レシピを保存');
  const input = h('input', { type: 'file', accept: 'application/json,.json', 'data-testid': 'recipe-input', hidden: '' });
  const load = h('button', { 'data-testid': 'recipe-load' }, 'レシピを読み込む');
  const status = h('div', { class: 'notices', 'data-testid': 'recipe-status' });
  const saveRoot = save;
  const loadRoot = h('div', { class: 'recipe-load' }, load, h('p', { class: 'muted' }, '同じ写真を先に入れてください'), input);
  load.addEventListener('click', () => input.click());
  const panel: RecipePanel = {
    saveRoot,
    status,
    loadRoot,
    onSave: (fn) => save.addEventListener('click', fn),
    onLoad(fn) {
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        input.value = '';
        if (!f) return;
        // Not read at all when it cannot be a recipe (008 FR-814).
        if (f.size > MAX_RECIPE_BYTES) panel.setStatus([RECIPE_TOO_LARGE], 'error');
        else fn(await f.text());
      });
    },
    setSaveEnabled: (e) => (save.disabled = !e),
    setStatus(lines, kind = 'info') {
      status.className = kind === 'error' ? 'errors' : 'notices';
      status.replaceChildren(...lines.map((l) => h('p', {}, l)));
    },
  };
  return panel;
}
