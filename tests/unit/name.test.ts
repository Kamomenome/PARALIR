import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_FILE_NAME } from '../../src/app/version';

describe('the app is called PARALIR (010 FR-1001, FR-1002, SC-1002)', () => {
  it('on screen PARALIR, in file names paralir', () => {
    expect(APP_NAME).toBe('PARALIR');
    expect(APP_FILE_NAME).toBe('paralir');
  });

  it('the old name is left only in the glossary and the past specs', () => {
    let hits = '';
    try {
      hits = execFileSync('git', ['grep', '-l', '-i', 'paraller', '--', '.', ':!docs/GLOSSARY.md', ':!specs/00*', ':!specs/010-paralir', ':!tests/unit/name.test.ts'], { encoding: 'utf8' }).trim();
    } catch (e: any) {
      if (e.status !== 1) throw e; // 1: nothing found
    }
    expect(hits.split('\n').filter(Boolean)).toEqual([]);
  });
});
