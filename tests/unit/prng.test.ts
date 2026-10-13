import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromHex } from '../../src/engine/common/hash/sha256';
import { Seeded32 } from '../../src/engine/common/prng/seeded32';

const fixture = JSON.parse(readFileSync('tests/fixtures/prng-vectors.json', 'utf8')) as {
  vectors: { name: string; seedHex: string; u32: number[]; u: number[] }[];
};

describe('seeded32-v1 against the independent Python implementation', () => {
  it.each(fixture.vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const r = new Seeded32(fromHex(v.seedHex));
    const r2 = new Seeded32(fromHex(v.seedHex));
    for (let i = 0; i < 16; i++) {
      expect(r.nextU32()).toBe(v.u32[i]);
      expect(r2.next()).toBe(v.u[i]);
    }
  });

  it('reads the first 16 bytes as four big-endian uint32 and ignores the rest', () => {
    const a = new Uint8Array(32).fill(7);
    const b = new Uint8Array(32).fill(7);
    b[20] = 99;
    expect(new Seeded32(a).next()).toBe(new Seeded32(b).next());
  });

  it('sets the last state word to 1 when the state would be all zero', () => {
    // The all-zero fixture only works because of this rule (otherwise it would emit 0 forever).
    const r = new Seeded32(new Uint8Array(16));
    const values = Array.from({ length: 4 }, () => r.nextU32());
    expect(values.some((v) => v !== 0)).toBe(true);
  });

  it('returns values in [0, 1)', () => {
    const r = new Seeded32(fromHex(fixture.vectors[2].seedHex));
    for (let i = 0; i < 1000; i++) {
      const u = r.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});
