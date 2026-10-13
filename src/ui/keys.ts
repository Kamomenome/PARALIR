export type KeyAction = 'next' | 'restore';

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Tags whose own keys (typing, choosing, sliding, pressing) are never taken. */
const OWN_KEYS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'OPTION']);

/** Space is 別の世界 and Ctrl+Z / ⌘Z is ひとつ戻す, only when the focus has no use for the key (007 FR-708). */
export function keyAction(e: KeyLike, target: { tag: string; editable?: boolean }): KeyAction | null {
  if (OWN_KEYS.has(target.tag) || target.editable) return null;
  if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return 'next';
  if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) return 'restore';
  return null;
}
