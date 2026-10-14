import { describe, expect, it } from 'vitest';
import { ENGINE } from '../../src/engine/engines';
import { WORLDS } from '../../src/engine/space-v2/worlds';

describe('the portal and the darkness are gone (017 FR-1703, SC-1702)', () => {
  it('the engine has five worlds', () => {
    expect(WORLDS.map((w) => w.type)).toEqual(['copies', 'split', 'mosaic', 'echo', 'theme']);
    expect(ENGINE.worlds.map((w) => w.type)).not.toContain('portal');
  });
});
