import type { ThemeRange } from '../engine/common/parts/lasso';
import type { PartsResult } from '../app/state';
import type { SpaceControls } from '../engine/space-v2/types';
import { WORLDS, worldOf } from '../engine/space-v2/worlds';
import { h } from './layout';

/** The one slider (021 FR-2101): 変貌. */
const SLIDERS: [keyof SpaceControls, string][] = [['morph', '変貌']];

/** The world select's names and notes come from the engine's registry (009 FR-902). */
const TYPES: [string, string, string][] = WORLDS.map((w) => [w.type, w.label, w.note]);

export interface SpacePanel {
  root: HTMLElement;
  /** What is said about the picture, placed under it (007 FR-704): the lasso and its buttons. */
  captionItems: HTMLElement[];
  /** What the AI saw, in 技術的な表示 (016 FR-1604). */
  partsLine: HTMLElement;
  /** `seeded` is the seed's own choice; the split world needs a subject. */
  show(c: SpaceControls, type: string, visible: boolean, seeded: string | null, hasSubject: boolean): void;
  onSlider(fn: (patch: Partial<SpaceControls>) => void): void;
  onType(fn: (t: string) => void): void;
  /** What the AI saw in the photo (004); null while it is still looking. */
  showParts(p: PartsResult | null): void;
  /** The lasso's range (005): where it came from; the clear button is shown only with a lasso. Drawn on the photo (019 FR-1904). */
  showLasso(range: ThemeRange | null, showing: 'photo' | 'world'): void;
  /** Whether the template on screen uses the lasso (017 FR-1706). */
  lassoWorks(): boolean;
  onLassoClear(fn: () => void): void;
  /** 線を隠す／線を出す: the lasso's line only; the picture stays (011 FR-1105). */
  onOutline(fn: () => void): void;
  setOutline(visible: boolean): void;
}

/** The lasso is drawn on the photo, then 反映 (019 FR-1904). */
const LASSO_HINT = { photo: '写真の上をドラッグして主役を囲みます（Shift で足せます）。囲んだら「反映」', world: '主役を囲むには「元の画像を表示」にしてください' };
const lassoLine = (range: ThemeRange | null, showing: 'photo' | 'world') =>
  (!range ? '' : range.source === 'lasso+ai' ? '囲み: AI が認識した輪郭を主役にしています。' : '囲み: 囲んだ形のまま主役にしています（AI が合う物を見つけられませんでした）。') + LASSO_HINT[showing];

/** The AI parts in a line (004 FR-408). */
function partsLine(p: PartsResult | null): { state: string; text: string; digest: string } {
  if (!p) return { state: 'pending', text: '写真の部品を見分けています…', digest: '' };
  if (p.status !== 'ok') return { state: p.status, text: `部品の見分けなし（推定で描画）: ${p.reason}`, digest: '' };
  const q = p.parts;
  const faces = q.faces.length ? `・顔 ${q.faces.length}` : '';
  const text = q.person ? `部品（AI）: 人物あり${faces}` : q.object ? `部品（AI）: 人物なし・物の切り抜きあり${faces}` : `部品（AI）: 人物なし・切り抜きなし（推定で描画）${faces}`;
  return { state: q.person ? 'person' : q.object ? 'object' : 'none', text: `${text}（${p.ms} ms）`, digest: q.digest };
}

/** Spatial-mode controls (spec 003): the mode, the actions under it and the one slider, 変貌 (021 FR-2101), that keeps the seed. */
export function buildSpacePanel(actions: HTMLElement): SpacePanel {
  // No おまかせ (013B FR-1311): the modes only; the first photo comes with the drawn one selected.
  const select = h('select', { 'data-testid': 'space-world', id: 'space-world' }, ...TYPES.map(([v, l]) => h('option', { value: v }, l)));
  const note = h('p', { class: 'muted', 'data-testid': 'world-note' });
  const sliders = new Map<keyof SpaceControls, { input: HTMLInputElement; out: HTMLOutputElement }>();
  const fns: ((p: Partial<SpaceControls>) => void)[] = [];
  const rows = SLIDERS.map(([key, label]) => {
    const input = h('input', { type: 'range', min: '0', max: '1', step: '0.01', 'data-testid': `space-control-${key}` });
    const out = h('output', {});
    input.addEventListener('input', () => {
      out.textContent = Number(input.value).toFixed(2);
      fns.forEach((f) => f({ [key]: Number(input.value) }));
    });
    sliders.set(key, { input, out });
    return h('label', { class: 'slider' }, label, out, input);
  });
  const parts = h('span', { class: 'note', 'data-testid': 'parts-status', 'data-state': 'pending' });
  const lassoText = h('span', { class: 'note', 'data-testid': 'lasso-status', 'data-source': 'none' }, LASSO_HINT.photo);
  // Undoing the lasso's effect and hiding its line are two things (011 FR-1105).
  const lassoClear = h('button', { class: 'small', 'data-testid': 'lasso-clear', hidden: '' }, '囲みを解除');
  const lassoOutline = h('button', { class: 'small', 'data-testid': 'lasso-outline', hidden: '' }, '線を隠す');
  const outlineFns: (() => void)[] = [];
  lassoOutline.addEventListener('click', () => outlineFns.forEach((f) => f()));
  const clearFns: (() => void)[] = [];
  let lassoUsed = true;
  let hasRange = false;
  let onPhoto = true;
  lassoClear.addEventListener('click', () => clearFns.forEach((f) => f()));
  const root = h(
    'section',
    { 'data-testid': 'space-panel' },
    h('div', { class: 'group world' }, h('label', { class: 'muted', for: 'space-world' }, 'モード'), select, note),
    h('div', { class: 'group' }, actions),
    h('div', { class: 'group sliders' }, ...rows),
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
      select.value = shownType;
      const def = worldOf(type === 'auto' ? (seeded ?? '') : type);
      // The lasso works only where its range is used (FR-1706).
      lassoUsed = !def || !!def.usesRange;
      lassoText.hidden = !lassoUsed;
      lassoClear.hidden = !lassoUsed || !hasRange;
      lassoOutline.hidden = !lassoUsed || !hasRange || !onPhoto;
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
    showLasso(range, showing) {
      lassoText.dataset.source = range ? range.source : 'none';
      lassoText.textContent = lassoLine(range, showing);
      hasRange = !!range;
      onPhoto = showing === 'photo';
      lassoClear.hidden = !lassoUsed || !range;
      // The line and the range show on the photo only (019 FR-1904).
      lassoOutline.hidden = !lassoUsed || !range || !onPhoto;
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
