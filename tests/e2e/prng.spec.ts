import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const fixture = JSON.parse(readFileSync('tests/fixtures/prng-vectors.json', 'utf8')) as {
  vectors: { name: string; seedHex: string; u32: number[]; u: number[] }[];
};

test('seeded32-v1 gives the fixture sequence in the browser too (A03)', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async (vectors) => {
    // Served by the Vite dev server; paths are kept in variables so tsc does not resolve them.
    const prngPath = '/src/engine/common/prng/seeded32.ts';
    const hashPath = '/src/engine/common/hash/sha256.ts';
    const { Seeded32 } = await import(/* @vite-ignore */ prngPath);
    const { fromHex } = await import(/* @vite-ignore */ hashPath);
    return vectors.map((v: { seedHex: string }) => {
      const r = new Seeded32(fromHex(v.seedHex));
      return Array.from({ length: 16 }, () => r.next());
    });
  }, fixture.vectors);
  expect(result).toEqual(fixture.vectors.map((v) => v.u));
});
