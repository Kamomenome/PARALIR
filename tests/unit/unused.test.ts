import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('nothing is left that nothing uses (009 FR-921, SC-907)', () => {
  it('tools/unused.ts finds no unused file or export (those kept on purpose are in tools/unused-allow.json)', () => {
    let out = '';
    try {
      out = execFileSync(process.execPath, ['--import', 'tsx', 'tools/unused.ts'], { encoding: 'utf8' });
    } catch (e: any) {
      out = String(e.stdout ?? e);
      expect.fail(out);
    }
    expect(out).toContain('どこからも使われていない書き出し: 0');
  });
});
