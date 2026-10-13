import { describe, expect, it } from 'vitest';
import { partsNotice, validateSpaceRecipe } from '../../src/engine/recipe';

const base = {
  schemaVersion: 1,
  engineVersion: 'space-v2',
  prngVersion: 'seeded32-v1',
  analysisVersion: 'analysis-v1',
};

describe('parts in the spatial recipe (004 FR-404, SC-405)', () => {
  it('the optional parts entry is checked', () => {
    const errs = (parts: unknown) => validateSpaceRecipe({ ...base, parts }).filter((e) => e.startsWith('parts'));
    expect(errs(null)).toEqual([]);
    expect(errs({ version: 'parts-v2', digest: '0123456789abcdef' })).toEqual([]);
    expect(errs({ version: 'parts-v1', digest: '0123456789abcdef' }).length).toBeGreaterThan(0);
    expect(errs({ version: 'parts-v2', digest: 'xyz' }).length).toBeGreaterThan(0);
    expect(validateSpaceRecipe(base).filter((e) => e.startsWith('parts'))).toEqual([]);
  });

  it('a different parts digest is noticed, the same is not', () => {
    const a = { version: 'parts-v2' as const, digest: '0123456789abcdef' };
    expect(partsNotice(a, a.digest)).toEqual([]);
    expect(partsNotice(undefined, null)).toEqual([]);
    expect(partsNotice(null, null)).toEqual([]);
    expect(partsNotice(a, 'fedcba9876543210')[0]).toContain('部品の見分けが保存時と違います');
    expect(partsNotice(a, null)[0]).toContain('部品の見分けが保存時と違います');
    expect(partsNotice(null, a.digest)[0]).toContain('部品の見分けが保存時と違います');
  });
});
