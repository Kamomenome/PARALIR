import { h } from './layout';

export interface ControlsPanel {
  root: HTMLElement;
  show(canRestore: boolean, hasPhoto: boolean, showing: 'photo' | 'world'): void;
  onRestore(fn: () => void): void;
  onApply(fn: () => void): void;
  onShowPhoto(fn: () => void): void;
}

/**
 * 「ひとつ戻す」 (Ctrl+Z, 013 FR-1308) and, beside it, 「反映」: the picture with the settings; under them, small,
 * 「元の画像を表示」: the photo as it is, the settings kept, to compare (017 FR-1705).
 */
export function buildControls(): ControlsPanel {
  const restore = h('button', { 'data-testid': 'restore-previous' }, 'ひとつ戻す', h('kbd', {}, 'Ctrl+Z'));
  const apply = h('button', { class: 'key', 'data-testid': 'apply' }, '反映');
  const photo = h('button', { class: 'link', 'data-testid': 'show-photo' }, '元の画像を表示');
  const root = h('div', { class: 'actions' }, h('div', { class: 'row' }, restore, apply), photo);
  const fns = { restore: [] as (() => void)[], apply: [] as (() => void)[], photo: [] as (() => void)[] };
  restore.addEventListener('click', () => fns.restore.forEach((f) => f()));
  apply.addEventListener('click', () => fns.apply.forEach((f) => f()));
  photo.addEventListener('click', () => fns.photo.forEach((f) => f()));
  return {
    root,
    show(canRestore, hasPhoto, showing) {
      restore.disabled = !canRestore;
      apply.disabled = !hasPhoto || showing === 'world';
      photo.disabled = !hasPhoto || showing === 'photo';
    },
    onRestore: (fn) => fns.restore.push(fn),
    onApply: (fn) => fns.apply.push(fn),
    onShowPhoto: (fn) => fns.photo.push(fn),
  };
}
