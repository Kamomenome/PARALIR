import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { previewHash, previewVariety, waitForPreview, showWorld } from './helpers';


// The artwork time is when the photo goes in (016 FR-1601): the browser's clock and time zone are fixed instead.
test.use({ timezoneId: 'Asia/Tokyo' });
test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z')));

test('空間モード（space-v2）: 世界・固定とおまかせ・スライダー・別の世界・書き出し・レシピ・外部通信 0 件（003）', async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== origin) external.push(r.url());
  });
  await page.goto('/');
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await waitForPreview(page);
  await showWorld(page);

  await expect(page.getByTestId('space-panel')).toBeVisible();
  expect(await previewVariety(page)).toBeGreaterThan(50);
  const auto = await previewHash(page);
  // No おまかせ: the drawn mode is the one selected (013B FR-1311).
  const drawn = await page.getByTestId('space-world').inputValue();

  // Choosing each mode changes the picture; the drawn one comes back to the first picture.
  const seen = new Set<string>([auto]);
  for (const t of ['copies', 'split', 'mosaic']) {
    await page.getByTestId('space-world').selectOption(t);
    await waitForPreview(page);
    seen.add(await previewHash(page));
  }
  expect(seen.size).toBeGreaterThanOrEqual(3);
  await page.getByTestId('space-world').selectOption(drawn);
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(auto);

  // A slider changes the picture without changing the world (in a template the darkness slider works in, 017).
  await page.getByTestId('space-world').selectOption('copies');
  await waitForPreview(page);
  const copies = await previewHash(page);
  await page.getByTestId('space-control-darkness').fill('0.95');
  await waitForPreview(page);
  expect(await previewHash(page)).not.toBe(copies);
  await page.getByTestId('space-control-darkness').fill('0.5');
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(copies);
  await page.getByTestId('space-world').selectOption(drawn);
  await waitForPreview(page);

  // The same photo put in again at another time is another composition (別の世界 is gone 013, artwork time 016).
  await page.clock.setFixedTime(new Date('2026-10-12T00:30:00Z'));
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  // Wait for the new photo itself, not the picture still on screen.
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'photo');
  await waitForPreview(page);
  await showWorld(page);
  expect(await previewHash(page)).not.toBe(auto);

  const download = page.waitForEvent('download', { timeout: 240_000 });
  await page.getByTestId('export').click();
  const png = PNG.sync.read(readFileSync((await (await download).path())!));
  expect([png.width, png.height]).toEqual([2400, 1800]);

  const recipe = page.waitForEvent('download');
  await page.getByTestId('recipe-save').click();
  const saved = JSON.parse(readFileSync((await (await recipe).path())!, 'utf8'));
  expect(saved.engineVersion).toBe('space-v2');
  expect(saved.worldType).toBe(drawn);

  expect(external).toEqual([]);
});
