import { expect, test, type Page } from '@playwright/test';
import { IMAGES, drawLoop, previewHash, showPhotoView, waitForPreview } from './helpers';

test.use({ timezoneId: 'Asia/Tokyo' });

async function withPhoto(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
}

const status = (page: Page) => page.getByTestId('lasso-status');
const lines = (page: Page) => page.getByTestId('lasso-overlay').locator('polyline');

test('囲みは元の写真の上で描き、「反映」で変える。変換した絵の上では描けない（019 SC-1901）', async ({ page }) => {
  await withPhoto(page);
  const preview = page.getByTestId('preview');
  await expect(preview).toHaveAttribute('data-showing', 'photo');
  const photo = await previewHash(page);
  await expect(status(page)).toContainText('反映');

  // Drawing keeps the photo; Shift adds a second lasso, and the range is tinted over the photo.
  await drawLoop(page, 0.25, 0.4, 0.12);
  await expect(status(page)).toHaveAttribute('data-source', /^lasso/, { timeout: 30_000 });
  await waitForPreview(page);
  await expect(preview).toHaveAttribute('data-showing', 'photo');
  expect(await previewHash(page)).toBe(photo);
  await expect(lines(page)).toHaveCount(1);
  await drawLoop(page, 0.7, 0.6, 0.12, true);
  await expect(lines(page)).toHaveCount(2);
  await expect(preview).toHaveAttribute('data-showing', 'photo');
  const tint = page.getByTestId('lasso-range');
  await expect(tint).toBeVisible();
  expect(await tint.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0))).toBe(true);

  // 反映: the world, with no line or tint over it, and a hint to go back to the photo.
  await page.getByTestId('apply').click();
  await waitForPreview(page);
  await expect(preview).toHaveAttribute('data-showing', 'world');
  await expect(lines(page)).toHaveCount(0);
  await expect(tint).toBeHidden();
  await expect(status(page)).toContainText('元の画像を表示');
  const world = await previewHash(page);

  // A drag over the world does nothing.
  await drawLoop(page, 0.5, 0.5, 0.2);
  await page.waitForTimeout(500);
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(world);
  await expect(lines(page)).toHaveCount(0);

  // Back on the photo the lassos are there; 囲みを解除 keeps the photo.
  await showPhotoView(page);
  await expect(lines(page)).toHaveCount(2);
  await page.getByTestId('lasso-clear').click();
  await expect(status(page)).toHaveAttribute('data-source', 'none');
  await waitForPreview(page);
  await expect(preview).toHaveAttribute('data-showing', 'photo');
  await expect(lines(page)).toHaveCount(0);
});

test('「光の形」は物の複製・主題で出て、最初は写真から決まった形。写真に合わせる強さは出ない（019 SC-1904）', async ({ page }) => {
  await withPhoto(page);
  const shape = page.getByTestId('space-control-lightShape');
  await page.getByTestId('space-world').selectOption('copies');
  await waitForPreview(page);
  await expect(page.getByTestId('panel')).toContainText('光の形');
  await expect(shape).toBeVisible();
  expect(['0', '1']).toContain(await shape.inputValue());
  const before = await previewHash(page);
  await shape.fill(String(1 - Number(await shape.inputValue())));
  await waitForPreview(page);
  expect(await previewHash(page)).not.toBe(before);
  await page.getByTestId('space-world').selectOption('theme');
  await waitForPreview(page);
  await expect(shape).toBeVisible();
  await page.getByTestId('space-world').selectOption('mosaic');
  await waitForPreview(page);
  await expect(shape).toBeHidden();
  await expect(page.getByTestId('panel')).not.toContainText('写真に合わせる強さ');
  await expect(page.getByTestId('space-control-featureInfluence')).toHaveCount(0);
});
