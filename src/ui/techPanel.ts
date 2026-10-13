import type { AppState } from '../app/state';
import { engineEntry } from '../engine/engines';
import { formatOffset } from '../engine/common/time/snapshot';
import { h } from './layout';

/** The colours of what the AI saw, as drawn over the picture (partsOverlay.ts). */
export const PARTS_LEGEND: [string, string][] = [
  ['rgba(0, 210, 255, 0.45)', '人物（AI）'],
  ['rgba(255, 60, 200, 0.45)', '物の切り抜き（AI）'],
  ['rgba(255, 220, 0, 0.45)', '囲みから決まった範囲'],
  ['#ffffff', '主役の推定の枠'],
  ['#40ff80', '顔（AI）'],
];

export interface TechPanel {
  root: HTMLElement;
  show(state: AppState): void;
  onShowParts(fn: (on: boolean) => void): void;
}

/**
 * 「技術的な表示」 (016 FR-1603): closed at first. What the AI saw (and a switch to lay it over the picture), where
 * the lasso's range came from, the artwork time, the seed and the drawing's versions.
 */
export function buildTechPanel(partsLine: HTMLElement): TechPanel {
  const toggle = h('input', { type: 'checkbox', 'data-testid': 'show-parts', id: 'show-parts' });
  const legend = h('div', { class: 'legend', hidden: '' }, ...PARTS_LEGEND.map(([c, t]) => h('span', {}, h('i', { style: `background:${c}` }), t)));
  const lines = h('dl', { class: 'tech-lines' });
  const root = h(
    'details',
    { class: 'tech', 'data-testid': 'tech' },
    h('summary', {}, '技術的な表示'),
    h('label', { class: 'check', for: 'show-parts' }, toggle, 'AI が見分けた範囲を絵に重ねる'),
    legend,
    partsLine,
    lines,
  );
  const fns: ((on: boolean) => void)[] = [];
  toggle.addEventListener('change', () => {
    legend.hidden = !toggle.checked;
    fns.forEach((f) => f(toggle.checked));
  });
  const row = (k: string, v: string) => [h('dt', {}, k), h('dd', {}, v)];
  return {
    root,
    onShowParts: (f) => fns.push(f),
    show(s) {
      const t = s.time;
      const entry = engineEntry(s.engineId);
      const range = s.spaceRange ? (s.spaceRange.source === 'lasso+ai' ? 'AI が認識した輪郭' : '囲んだ形のまま') : 'なし（推定の範囲）';
      lines.replaceChildren(
        ...row('作品日時', `${t.localDateTime.replace('T', ' ')}　${t.timeZone}（UTC${formatOffset(t.offsetMinutes)}）`),
        ...row('seed', s.spaceSeeds ? `${s.spaceSeeds.rootSeed.slice(0, 16)}…` : '—'),
        ...row('おまかせの世界', s.spaceWorld?.type ?? '—'),
        ...row('囲みの範囲', range),
        ...row('描き方の版', entry ? `${entry.id}（${Object.values(entry.algorithms).join('・')}）` : s.engineId),
      );
    },
  };
}
