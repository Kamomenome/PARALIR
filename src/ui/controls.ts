import { h } from './layout';

export interface ControlsPanel {
  root: HTMLElement;
  show(canRestore: boolean): void;
  onRestore(fn: () => void): void;
}

/** 「ひとつ戻す」 (Ctrl+Z): back to the work before the last change (013 FR-1308). 別の世界 is gone (FR-1304). */
export function buildControls(): ControlsPanel {
  const restore = h('button', { 'data-testid': 'restore-previous' }, 'ひとつ戻す', h('kbd', {}, 'Ctrl+Z'));
  const root = h('div', { class: 'actions' }, h('div', { class: 'row' }, restore));
  const fns: (() => void)[] = [];
  restore.addEventListener('click', () => fns.forEach((f) => f()));
  return {
    root,
    show(canRestore) {
      restore.disabled = !canRestore;
    },
    onRestore: (fn) => fns.push(fn),
  };
}
