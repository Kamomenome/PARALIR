import type { ThemeRange } from '../engine/common/parts/lasso';
import type { PartsResult } from '../app/state';
import type { SpaceControls } from '../engine/space-v2/types';
import { WORLDS, worldOf } from '../engine/space-v2/worlds';
import { h } from './layout';

/** The sliders under 背景・主役・全体 (017 FR-1709), with plain names (FR-1704). */
const GROUPS: [string, [keyof SpaceControls, string][]][] = [
  ['背景', [['light', '光の強さ'], ['darkness', '背景の暗さ']]],
  ['主役', [['size', '主役の大きさ'], ['count', '長方形の数']]],
  ['全体', [['featureInfluence', '写真に合わせる強さ']]],
];

/** The world select's names and notes come from the engine's registry (009 FR-902). */
const TYPES: [string, string, string][] = WORLDS.map((w) => [w.type, w.label, w.note]);

export interface SpacePanel {
  root: HTMLElement;
  /** What is said about the picture, placed under it (007 FR-704): the lasso and its buttons. */
  captionItems: HTMLElement[];
  /** What the AI saw, in 技術的な表示 (016 FR-1604). */
  partsLine: HTMLElement;
  /** `seeded` is the seed's own choice, shown next to おまかせ; the split world needs a subject. */
  show(c: SpaceControls, type: string, visible: boolean, seeded: string | null, hasSubject: boolean): void;
  onSlider(fn: (patch: Partial<SpaceControls>) => void): void;
  onType(fn: (t: string) => void): void;
  /** What the AI saw in the photo (004); null while it is still looking. */
  showParts(p: PartsResult | null): void;
  /** The lasso's range (005): where it came from; the clear button is shown only with a lasso. */
  showLasso(range: ThemeRange | null): void;
  /** Whether the template on screen uses the lasso (017 FR-1706). */
  lassoWorks(): boolean;
  onLassoClear(fn: () => void): void;
  /** 線を隠す／線を出す: the lasso's line only; the picture stays (011 FR-1105). */
  onOutline(fn: () => void): void;
  setOutline(visible: boolean): void;
}

const LASSO_HINT = '絵の上をドラッグすると、主役にしたいあたりを囲めます（Shift を押しながらで囲みを足せます）';

/** The AI parts in a line (004 FR-408). */
function partsLine(p: PartsResult | null): { state: string; text: string; digest: string } {
  if (!p) return { state: 'pending', text: '写真の部品を見分けています…', digest: '' };
  if (p.status !== 'ok') return { state: p.status, text: `部品の見分けなし（推定で描画）: ${p.reason}`, digest: '' };
  const q = p.parts;
  const faces = q.faces.length ? `・顔 ${q.faces.length}` : '';
  const text = q.person ? `部品（AI）: 人物あり${faces}` : q.object ? `部品（AI）: 人物なし・物の切り抜きあり${faces}` : `部品（AI）: 人物なし・切り抜きなし（推定で描画）${faces}`;
  return { state: q.person ? 'person' : q.object ? 'object' : 'none', text: `${text}（${p.ms} ms）`, digest: q.digest };
}

/** Spatial-mode controls (spec 003): the world (おまかせ or fixed), the actions under it and five sliders that keep the seed. */
export function buildSpacePanel(actions: HTMLElement): SpacePanel {
  // No おまかせ (013B FR-1311): the modes only; the first photo comes with the drawn one selected.
  const select = h('select', { 'data-testid': 'space-world', id: 'space-world' }, ...TYPES.map(([v, l]) => h('option', { value: v }, l)));
  const note = h('p', { class: 'muted', 'data-testid': 'world-note' });
  const sliders = new Map<keyof SpaceControls, { input: HTMLInputElement; out: HTMLOutputElement }>();
  const fns: ((p: Partial<SpaceControls>) => void)[] = [];
  const rowsOf = new Map<keyof SpaceControls, HTMLElement>();
  const groups = GROUPS.map(([title, keys]) => {
    const rows = keys.map(([key, label]) => {
      const input = h('input', { type: 'range', min: '0', max: '1', step: '0.01', 'data-testid': `space-control-${key}` });
      const out = h('output', {});
      input.addEventListener('input', () => {
        out.textContent = Number(input.value).toFixed(2);
        fns.forEach((f) => f({ [key]: Number(input.value) }));
      });
      sliders.set(key, { input, out });
      const row = h('label', { class: 'slider' }, label, out, input);
      rowsOf.set(key, row);
      return row;
    });
    return { keys: keys.map(([k]) => k), el: h('div', { class: 'slider-group', 'data-testid': 'slider-group' }, h('div', { class: 'group-title' }, title), ...rows) };
  });
  const parts = h('span', { class: 'note', 'data-testid': 'parts-status', 'data-state': 'pending' });
  const lassoText = h('span', { class: 'note', 'data-testid': 'lasso-status', 'data-source': 'none' }, LASSO_HINT);
  // Undoing the lasso's effect and hiding its line are two things (011 FR-1105).
  const lassoClear = h('button', { class: 'small', 'data-testid': 'lasso-clear', hidden: '' }, '囲みを解除');
  const lassoOutline = h('button', { class: 'small', 'data-testid': 'lasso-outline', hidden: '' }, '線を隠す');
  const outlineFns: (() => void)[] = [];
  lassoOutline.addEventListener('click', () => outlineFns.forEach((f) => f()));
  const clearFns: (() => void)[] = [];
  let lassoUsed = true;
  let hasRange = false;
  lassoClear.addEventListener('click', () => clearFns.forEach((f) => f()));
  const root = h(
    'section',
    { 'data-testid': 'space-panel' },
    h('div', { class: 'group world' }, h('label', { class: 'muted', for: 'space-world' }, 'モード'), select, note),
    h('div', { class: 'group' }, actions),
    h('div', { class: 'group sliders' }, ...groups.map((g) => g.el)),
  );
  root.hidden = true;
  const typeFns: ((t: string) => void)[] = [];
  select.addEventListener('change', () => typeFns.forEach((f) => f(select.value)));
  return {
    root,
    captionItems: [lassoText, lassoOutline, lassoClear],
    partsLine: parts,
    lassoWorks: () => lassoUsed,
    show(c, type, visible, seeded, hasSubject) {
      root.hidden = !visible;
      // Before any photo (or while it settles) the seed's mode, if any, is the one shown.
      const shownType = type === 'auto' ? (seeded ?? TYPES[0][0]) : type;
      const chosen = TYPES.find(([v]) => v === shownType);
      note.textContent = chosen ? chosen[2] : '';
      // A frozen engine's world that is no longer offered still shows its name (017).
      if (![...select.options].some((o) => o.value === shownType)) select.append(h('option', { value: shownType }, `${shownType}（以前の版）`));
      select.value = shownType;
      // Only the sliders that change this template (017 FR-1704), under their headings (FR-1709).
      const def = worldOf(type === 'auto' ? (seeded ?? '') : type);
      const works = (k: keyof SpaceControls) => k === 'featureInfluence' || !def || (def.controls as readonly string[]).includes(k);
      for (const [key, row] of rowsOf) row.hidden = !works(key);
      for (const g of groups) g.el.hidden = !g.keys.some(works);
      // The lasso works only where its range is used (FR-1706).
      lassoUsed = !def || !!def.usesRange;
      lassoText.hidden = !lassoUsed;
      lassoClear.hidden = !lassoUsed || !hasRange;
      lassoOutline.hidden = !lassoUsed || !hasRange;
      // Worlds that need a subject are not offered for a photo without one.
      for (const w of WORLDS) {
        const option = [...select.options].find((o) => o.value === w.type);
        if (option) option.disabled = !!w.needsSubject && !hasSubject;
      }
      for (const [key, { input, out }] of sliders) {
        input.value = String(c[key]);
        out.textContent = c[key].toFixed(2);
      }
    },
    onSlider: (f) => fns.push(f),
    onType: (f) => typeFns.push(f),
    showLasso(range) {
      lassoText.dataset.source = range ? range.source : 'none';
      lassoText.textContent = !range
        ? LASSO_HINT
        : range.source === 'lasso+ai'
          ? '囲み: AI が認識した輪郭を主役にしています（Shift で足せます）'
          : '囲み: 囲んだ形のまま主役にしています（AI が合う物を見つけられませんでした）';
      hasRange = !!range;
      lassoClear.hidden = !lassoUsed || !range;
      lassoOutline.hidden = !lassoUsed || !range;
    },
    onLassoClear: (f) => clearFns.push(f),
    onOutline: (f) => outlineFns.push(f),
    setOutline: (visible) => (lassoOutline.textContent = visible ? '線を隠す' : '線を出す'),
    showParts(p) {
      const l = partsLine(p);
      parts.dataset.state = l.state;
      parts.dataset.digest = l.digest;
      parts.textContent = l.text;
    },
  };
}
