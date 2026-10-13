import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { previewHash, waitForPreview } from './helpers';

test('ざっくり囲むと範囲が変わり、消すと戻り、レシピで再現、外部通信 0 件（005 SC-504）', async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== origin) external.push(r.url());
  });
  await page.goto('/');
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await waitForPreview(page);
  await page.getByTestId('space-world').selectOption('mosaic');
  await waitForPreview(page);
  await expect(page.getByTestId('parts-status')).not.toHaveAttribute('data-state', 'pending', { timeout: 120_000 });
  const before = await previewHash(page);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', 'none');

  // A rough loop over the left part of the picture.
  const box = (await page.getByTestId('preview').boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  await page.mouse.move(...at(0.15, 0.35));
  await page.mouse.down();
  for (let k = 1; k <= 24; k++) {
    const a = (2 * Math.PI * k) / 24;
    await page.mouse.move(...at(0.27 + 0.12 * Math.cos(a + Math.PI), 0.45 + 0.15 * Math.sin(a + Math.PI)));
  }
  await page.mouse.up();
  await waitForPreview(page);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^(lasso|lasso\+ai)$/, { timeout: 60_000 });
  await waitForPreview(page);
  const lassoed = await previewHash(page);
  expect(lassoed).not.toBe(before);

  const recipe = page.waitForEvent('download');
  await page.getByTestId('recipe-save').click();
  const saved = JSON.parse(readFileSync((await (await recipe).path())!, 'utf8'));
  expect(saved.lassos[0].length).toBeGreaterThanOrEqual(3);

  await page.getByTestId('lasso-clear').click();
  await waitForPreview(page);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', 'none');
  expect(await previewHash(page)).toBe(before);

  await page.setInputFiles('[data-testid="recipe-input"]', { name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^(lasso|lasso\+ai)$/, { timeout: 60_000 });
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(lassoed);
  expect(external).toEqual([]);
});
