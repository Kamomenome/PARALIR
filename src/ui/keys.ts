export type KeyAction = 'restore';

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Tags that have their own undo; a focused button (e.g. 別の世界 just clicked) has none (011). */
const OWN_UNDO = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'OPTION']);

/** Ctrl+Z / ⌘Z is ひとつ戻す, only when the focus has no undo of its own (007 FR-708). Space has no shortcut since 013. */
export function keyAction(e: KeyLike, target: { tag: string; editable?: boolean }): KeyAction | null {
  if (target.editable) return null;
  if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) return OWN_UNDO.has(target.tag) ? null : 'restore';
  return null;
}
