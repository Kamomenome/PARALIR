import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { currentVersions, drawWorldCells } from '../helpers/worlds';

const FIXTURE = 'tests/fixtures/world-hashes.json';

describe('the 7 worlds draw the same pixels until their version is raised (008 FR-801, SC-801)', () => {
  it('every world, variations 0..5, and the theme with a lasso', { timeout: 600_000 }, async () => {
    expect(existsSync(FIXTURE), `${FIXTURE} がありません。npx tsx tools/world-hashes.ts で記録してください`).toBe(true);
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    expect(currentVersions(), '世界の版が記録時と違います。絵を確かめてから npx tsx tools/world-hashes.ts で記録し直してください').toEqual(fixture.versions);
    const cells = await drawWorldCells();
    expect(cells.length).toBe(fixture.cells.length);
    for (const [i, c] of cells.entries()) {
      const f = fixture.cells[i];
      const name = `${c.world} v${c.variation}${c.lasso ? ' 囲みあり' : ''}`;
      expect(`${c.world}/${c.variation}/${c.lasso}`, name).toBe(`${f.world}/${f.variation}/${f.lasso}`);
      expect(c.rgbaSha256, `${name} の絵が変わりました。変えるなら、その世界の版（SPACE_ALGORITHM_VERSIONS）を上げてから記録し直してください`).toBe(f.rgbaSha256);
    }
  });
});
