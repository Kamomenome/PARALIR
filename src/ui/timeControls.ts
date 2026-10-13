import type { TimeSnapshot } from '../engine/common/time/snapshot';
import { h } from './layout';

export interface TimeControls {
  root: HTMLElement;
  show(t: TimeSnapshot): void;
  onChange(fn: (local: string, timeZone: string) => void): void;
  onNow(fn: () => void): void;
}

function timeZones(current: string): string[] {
  const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const set = new Set([current, 'UTC', ...list]);
  return [...set];
}

const RESOLUTION_TEXT: Record<TimeSnapshot['resolution'], string> = {
  exact: '',
  gap: 'この時刻は夏時間の切替で存在しないため、後ろへずらして解決しました',
  ambiguous: 'この時刻は夏時間の切替で2回あるため、早い方に解決しました',
};

/** 作品日時の入力・タイムゾーン・「現在に合わせる」（FR-018）. */
export function buildTimeControls(initial: TimeSnapshot): TimeControls {
  const input = h('input', { type: 'datetime-local', step: '0.001', 'data-testid': 'time-input', id: 'time-input' });
  const zone = h('select', { 'data-testid': 'timezone-select' });
  for (const z of timeZones(initial.timeZone)) zone.append(h('option', { value: z }, z));
  const now = h('button', { 'data-testid': 'time-now' }, '現在に合わせる');
  const note = h('p', { class: 'muted', 'data-testid': 'time-resolution' });
  const root = h('div', { class: 'time-controls' }, h('label', { class: 'muted', for: 'time-input' }, '日時（同じ写真と日時なら同じ絵になります）'), input, h('div', { class: 'row' }, zone, now), note);
  const changeFns: ((l: string, z: string) => void)[] = [];
  const nowFns: (() => void)[] = [];
  const fire = () => {
    if (input.value) for (const fn of changeFns) fn(input.value, zone.value);
  };
  input.addEventListener('change', fire);
  zone.addEventListener('change', fire);
  now.addEventListener('click', () => nowFns.forEach((fn) => fn()));
  return {
    root,
    show(t) {
      input.value = t.localDateTime;
      zone.value = t.timeZone;
      note.textContent = RESOLUTION_TEXT[t.resolution];
    },
    onChange: (fn) => changeFns.push(fn),
    onNow: (fn) => nowFns.push(fn),
  };
}
