import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** Test images made by tools (tools/make-scene.ts, tools/py/make_fixtures.py): no one's photo (009 FR-922). */
const MADE = ['broken.jpg', 'exif-rotated.jpg', 'gradient-64x48.png', 'huge-header.png', 'same-pixels-a.png', 'same-pixels-b.png', 'scene.png', 'translucent.png'];

describe('no real photo is in the repository (009 FR-922, SC-908)', () => {
  it('every image git keeps is a test image made by a tool', () => {
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(jpe?g|png|heic|webp|gif|bmp|tiff?)$/i.test(f));
    expect(tracked.map((f) => f.split('/').pop()).sort()).toEqual([...MADE].sort());
    expect(tracked.every((f) => f.startsWith('tests/fixtures/images/'))).toBe(true);
  });
});
