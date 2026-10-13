import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { IMAGES, openDetails, showWorld, waitForPreview } from './helpers';

test.use({ timezoneId: 'Asia/Tokyo' });

test('作品日時は写真を入れた時刻。入力・地域・「現在に合わせる」はない。レシピではレシピの日時（016 SC-1601）', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  for (const id of ['time-input', 'timezone-select', 'time-now']) await expect(page.getByTestId(id)).toHaveCount(0);
  // Opened a while ago; the photo goes in now.
  await page.clock.setFixedTime(new Date('2026-10-11T05:30:00Z'));
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/gradient-64x48.png`);
  await waitForPreview(page);
  await showWorld(page);
  await openDetails(page);
  const tech = page.getByTestId('tech');
  await tech.locator(':scope > summary').click();
  await expect(tech).toContainText('2026-10-11 14:30');
  await expect(tech).toContainText('Asia/Tokyo');

  const recipe = page.waitForEvent('download');
  await page.getByTestId('recipe-save').click();
  const path = (await (await recipe).path())!;
  expect(JSON.parse(readFileSync(path, 'utf8')).time.localDateTime).toBe('2026-10-11T14:30:00.000');
  // Later, the same photo and the recipe: the recipe's time comes back.
  await page.clock.setFixedTime(new Date('2026-10-12T01:00:00Z'));
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/gradient-64x48.png`);
  await waitForPreview(page);
  await page.setInputFiles('[data-testid="recipe-input"]', path);
  await expect(page.getByTestId('recipe-status')).toContainText('読み込みました');
  await expect(tech).toContainText('2026-10-11 14:30');
});

test('技術的な表示は閉じて始まり、AI の結果・作品日時・seed・版が出る。範囲を重ねても絵は変わらない（016 SC-1602）', async ({ page }) => {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  await showWorld(page);
  await openDetails(page);
  const tech = page.getByTestId('tech');
  await expect(tech).toHaveJSProperty('open', false);
  await tech.locator(':scope > summary').click();
  await expect(tech.getByTestId('parts-status')).toBeVisible();
  for (const word of ['作品日時', 'seed', 'space-v2', 'mosaic-v2']) await expect(tech).toContainText(word);
  // Technical lines are no longer under the picture (FR-1604).
  await expect(page.locator('.caption [data-testid="parts-status"]')).toHaveCount(0);

  const canvasBefore = await page.getByTestId('preview').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByTestId('show-parts').check();
  const overlay = page.getByTestId('parts-overlay');
  await expect(overlay).toBeVisible();
  const painted = await overlay.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(0);
  // A see-through layer: the picture stays visible under it.
  expect(await overlay.evaluate((c) => getComputedStyle(c).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.getByTestId('preview').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(canvasBefore);
  await page.getByTestId('show-parts').uncheck();
  await expect(overlay).toBeHidden();
});
