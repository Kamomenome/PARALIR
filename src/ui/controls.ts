import { h } from './layout';

export interface ControlsPanel {
  root: HTMLElement;
  show(variationIndex: number, canRestore: boolean): void;
  onNextWorld(fn: () => void): void;
  onRestore(fn: () => void): void;
}

/** 「別の世界」(the one key action, Space), 「ひとつ戻す」(Ctrl+Z) and the variation number (007 FR-703, FR-705). */
export function buildControls(): ControlsPanel {
  const variation = h('span', { 'data-testid': 'variation' }, '0');
  const next = h('button', { class: 'key', 'data-testid': 'next-world' }, '別の世界', h('kbd', {}, 'Space'));
  const restore = h('button', { 'data-testid': 'restore-previous' }, 'ひとつ戻す', h('kbd', {}, 'Ctrl+Z'));
  const root = h('div', { class: 'actions' }, next, h('div', { class: 'row' }, restore, h('span', { class: 'muted' }, '別案 ', variation)));
  const fns = { next: [] as (() => void)[], restore: [] as (() => void)[] };
  next.addEventListener('click', () => fns.next.forEach((f) => f()));
  restore.addEventListener('click', () => fns.restore.forEach((f) => f()));
  return {
    root,
    show(v, canRestore) {
      variation.textContent = String(v);
      restore.disabled = !canRestore;
    },
    onNextWorld: (fn) => fns.next.push(fn),
    onRestore: (fn) => fns.restore.push(fn),
  };
}
