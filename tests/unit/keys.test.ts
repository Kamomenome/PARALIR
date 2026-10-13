import { describe, expect, it } from 'vitest';
import { keyAction } from '../../src/ui/keys';

const key = (k: string, mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('keyboard shortcuts (007 FR-708)', () => {
  it('Ctrl+Z / ⌘Z is ひとつ戻す on the page itself; Space does nothing (別の世界 is gone, 013)', () => {
    expect(keyAction(key(' '), { tag: 'BODY' })).toBeNull();
    expect(keyAction(key('z', { ctrlKey: true }), { tag: 'BODY' })).toBe('restore');
    expect(keyAction(key('Z', { metaKey: true }), { tag: 'CANVAS' })).toBe('restore');
  });

  it('other keys and modified Space do nothing', () => {
    expect(keyAction(key('a'), { tag: 'BODY' })).toBeNull();
    expect(keyAction(key(' ', { ctrlKey: true }), { tag: 'BODY' })).toBeNull();
    expect(keyAction(key('z'), { tag: 'BODY' })).toBeNull();
    expect(keyAction(key('z', { ctrlKey: true, shiftKey: true }), { tag: 'BODY' })).toBeNull();
  });

  it('never takes Space from text, selects, sliders, buttons or summaries', () => {
    for (const tag of ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY']) expect(keyAction(key(' '), { tag }), tag).toBeNull();
    expect(keyAction(key(' '), { tag: 'DIV', editable: true })).toBeNull();
  });

  it('takes Ctrl+Z from buttons and summaries (they have no undo), never from text fields or selects (011)', () => {
    for (const tag of ['BUTTON', 'SUMMARY']) expect(keyAction(key('z', { ctrlKey: true }), { tag }), tag).toBe('restore');
    for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) expect(keyAction(key('z', { ctrlKey: true }), { tag }), tag).toBeNull();
    expect(keyAction(key('z', { ctrlKey: true }), { tag: 'DIV', editable: true })).toBeNull();
  });
});
