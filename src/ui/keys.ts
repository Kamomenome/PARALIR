export type KeyAction = 'next' | 'restore';

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Tags that use Space themselves (typing, choosing, sliding, pressing). */
const OWN_SPACE = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'OPTION']);
/** Tags that have their own undo; a focused button (e.g. 別の世界 just clicked) has none (011). */
const OWN_UNDO = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'OPTION']);

/** Space is 別の世界 and Ctrl+Z / ⌘Z is ひとつ戻す, only when the focus has no use for the key (007 FR-708). */
export function keyAction(e: KeyLike, target: { tag: string; editable?: boolean }): KeyAction | null {
  if (target.editable) return null;
  if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return OWN_SPACE.has(target.tag) ? null : 'next';
  if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) return OWN_UNDO.has(target.tag) ? null : 'restore';
  return null;
}
