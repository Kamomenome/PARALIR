import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { IMAGES, waitForPreview } from './helpers';

/** A 12-megapixel PNG: slow enough to decode that the work is seen. */
function bigPhoto() {
  const png = new PNG({ width: 4000, height: 3000 });
  for (let i = 0; i < 4000 * 3000; i++) {
    png.data[i * 4] = i & 255;
    png.data[i * 4 + 1] = (i >> 8) & 255;
    png.data[i * 4 + 2] = 128;
    png.data[i * 4 + 3] = 255;
  }
  return { name: 'big.png', mimeType: 'image/png', buffer: PNG.sync.write(png) };
}

test('大きな写真を入れるとクルクルと「写真を読み込んでいます…」が出て、終わると消える（012 SC-1201）', async ({ page }) => {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', bigPhoto());
  const busy = page.getByTestId('busy');
  await expect(busy).toBeVisible();
  await expect(busy).toContainText('写真を読み込んでいます…');
  await waitForPreview(page);
  await expect(busy).toBeHidden();
});

test('AI があるとき、AI が終わる前に元の写真が出て、その間「AI が写真を見ています…」（012 SC-1202）', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'photo');
  await expect(page.getByTestId('preview')).toBeVisible();
  await expect(page.getByTestId('busy')).toContainText('AI が写真を見ています…');
  await expect(page.getByTestId('parts-status')).toHaveAttribute('data-state', 'pending');
  await expect(page.getByTestId('parts-status')).not.toHaveAttribute('data-state', 'pending', { timeout: 180_000 });
  await waitForPreview(page);
  await expect(page.getByTestId('busy')).toBeHidden();
});

test('動きを減らす設定では印が回らない（012 SC-1203）', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?ai=off');
  const name = await page.locator('.busy .spinner').evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe('none');
});
