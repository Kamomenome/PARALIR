import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { previewHash, previewVariety, waitForPreview, openDetails, showWorld } from './helpers';

test('空間モード（space-v2）: 世界・固定とおまかせ・スライダー・別の世界・書き出し・レシピ・外部通信 0 件（003）', async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== origin) external.push(r.url());
  });
  await page.goto('/');
  await openDetails(page);
  await page.getByTestId('timezone-select').selectOption('Asia/Tokyo');
  await page.getByTestId('time-input').fill('2026-10-11T12:00');
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await waitForPreview(page);
  await showWorld(page);

  await expect(page.getByTestId('space-panel')).toBeVisible();
  expect(await previewVariety(page)).toBeGreaterThan(50);
  const auto = await previewHash(page);

  // Fixing each world changes the picture; おまかせ comes back to the seed's world.
  const seen = new Set<string>([auto]);
  for (const t of ['copies', 'dark', 'split']) {
    await page.getByTestId('space-world').selectOption(t);
    await waitForPreview(page);
    seen.add(await previewHash(page));
  }
  expect(seen.size).toBeGreaterThanOrEqual(3);
  await page.getByTestId('space-world').selectOption('auto');
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(auto);

  // A slider changes the picture without changing the world.
  await page.getByTestId('space-control-darkness').fill('0.95');
  await waitForPreview(page);
  await page.getByTestId('space-control-darkness').fill('0.5');
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(auto);

  await page.getByTestId('next-world').click();
  await waitForPreview(page);
  expect(await previewHash(page)).not.toBe(auto);

  const download = page.waitForEvent('download', { timeout: 240_000 });
  await page.getByTestId('export').click();
  const png = PNG.sync.read(readFileSync((await (await download).path())!));
  expect([png.width, png.height]).toEqual([2400, 1800]);

  const recipe = page.waitForEvent('download');
  await page.getByTestId('recipe-save').click();
  const saved = JSON.parse(readFileSync((await (await recipe).path())!, 'utf8'));
  expect(saved.engineVersion).toBe('space-v2');
  expect(saved.worldType).toBe('auto');

  expect(external).toEqual([]);
});
