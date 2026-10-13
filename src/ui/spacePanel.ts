import type { ThemeRange } from '../engine/common/parts/lasso';
import type { PartsResult } from '../app/state';
import type { SpaceControls } from '../engine/space-v2/types';
import { WORLDS } from '../engine/space-v2/worlds';
import { h } from './layout';

const LABELS: [keyof SpaceControls, string][] = [
  ['light', '光の強さ'],
  ['size', '主役の大きさ'],
  ['count', '数の多さ（闇と光）'],
  ['darkness', '背景の暗さ'],
  ['featureInfluence', '画像特徴の影響'],
];

/** The world select's names and notes come from the engine's registry (009 FR-902). */
const TYPES: [string, string, string][] = WORLDS.map((w) => [w.type, w.label, w.note]);

export interface SpacePanel {
  root: HTMLElement;
  /** What is said about the picture, placed under it (007 FR-704): parts, lasso, clear. */
  captionItems: HTMLElement[];
  /** `seeded` is the seed's own choice, shown next to おまかせ; the split world needs a subject. */
  show(c: SpaceControls, type: string, visible: boolean, seeded: string | null, hasSubject: boolean): void;
  onSlider(fn: (patch: Partial<SpaceControls>) => void): void;
  onType(fn: (t: string) => void): void;
  /** What the AI saw in the photo (004); null while it is still looking. */
  showParts(p: PartsResult | null): void;
  /** The lasso's range (005): where it came from; the clear button is shown only with a lasso. */
  showLasso(range: ThemeRange | null): void;
  onLassoClear(fn: () => void): void;
  /** 線を隠す／線を出す: the lasso's line only; the picture stays (011 FR-1105). */
  onOutline(fn: () => void): void;
  setOutline(visible: boolean): void;
}

const LASSO_HINT = '絵の上をドラッグすると、主題にしたいあたりを囲めます';

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
  const select = h('select', { 'data-testid': 'space-world', id: 'space-world' }, h('option', { value: 'auto' }, 'おまかせ'), ...TYPES.map(([v, l]) => h('option', { value: v }, l)));
  const note = h('p', { class: 'muted', 'data-testid': 'world-note' });
  const sliders = new Map<keyof SpaceControls, { input: HTMLInputElement; out: HTMLOutputElement }>();
  const fns: ((p: Partial<SpaceControls>) => void)[] = [];
  const rows = LABELS.map(([key, label]) => {
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
  const lassoText = h('span', { class: 'note', 'data-testid': 'lasso-status', 'data-source': 'none' }, LASSO_HINT);
  // Undoing the lasso's effect and hiding its line are two things (011 FR-1105).
  const lassoClear = h('button', { class: 'small', 'data-testid': 'lasso-clear', hidden: '' }, '囲みを解除');
  const lassoOutline = h('button', { class: 'small', 'data-testid': 'lasso-outline', hidden: '' }, '線を隠す');
  const outlineFns: (() => void)[] = [];
  lassoOutline.addEventListener('click', () => outlineFns.forEach((f) => f()));
  const clearFns: (() => void)[] = [];
  lassoClear.addEventListener('click', () => clearFns.forEach((f) => f()));
  const root = h(
    'section',
    { 'data-testid': 'space-panel' },
    h('div', { class: 'group world' }, h('label', { class: 'muted', for: 'space-world' }, '世界'), select, note),
    h('div', { class: 'group' }, actions),
    h('div', { class: 'group sliders' }, ...rows),
  );
  root.hidden = true;
  const typeFns: ((t: string) => void)[] = [];
  select.addEventListener('change', () => typeFns.forEach((f) => f(select.value)));
  return {
    root,
    captionItems: [parts, lassoText, lassoOutline, lassoClear],
    show(c, type, visible, seeded, hasSubject) {
      root.hidden = !visible;
      select.value = type;
      const chosen = TYPES.find(([v]) => v === (type === 'auto' ? seeded : type));
      (select.options[0] as HTMLOptionElement).textContent = seeded && chosen ? `おまかせ（${chosen[1]}）` : 'おまかせ';
      note.textContent = chosen ? chosen[2] : '写真と作品日時から世界を選びます';
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
          ? '囲み: AI が認識した輪郭を主題にしています'
          : '囲み: 囲んだ形のまま主題にしています（AI が合う物を見つけられませんでした）';
      lassoClear.hidden = !range;
      lassoOutline.hidden = !range;
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
