import { expect, test, type Page } from '@playwright/test';
import { IMAGES, drawLoop, previewHash, showPhotoView, showWorld, waitForPreview } from './helpers';

/** A loop on the photo (019 FR-1901), then the world it gives. */
async function loop(page: Page, cx: number, cy: number, r: number, shift = false) {
  await showPhotoView(page);
  await drawLoop(page, cx, cy, r, shift);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^lasso/, { timeout: 30_000 });
  await waitForPreview(page);
  await showWorld(page);
}

test('囲みはどのテンプレートでも主役を決め、Shift で足せ、ふつうのドラッグで置き換わる（013B SC-1307）', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  await page.getByTestId('space-world').selectOption('copies');
  await waitForPreview(page);
  const plain = await previewHash(page);
  await expect(page.getByTestId('lasso-status')).toBeVisible();
  const lines = page.getByTestId('lasso-overlay').locator('polyline');

  const count = async (n: number) => {
    await showPhotoView(page);
    await expect(lines).toHaveCount(n);
    await showWorld(page);
  };
  await loop(page, 0.25, 0.4, 0.12);
  await count(1);
  const one = await previewHash(page);
  expect(one).not.toBe(plain);
  await loop(page, 0.7, 0.6, 0.12, true);
  await count(2);
  expect(await previewHash(page)).not.toBe(one);
  await loop(page, 0.5, 0.5, 0.1);
  await count(1);
  await page.getByTestId('lasso-clear').click();
  await waitForPreview(page);
  await showPhotoView(page);
  await expect(lines).toHaveCount(0);
  await showWorld(page);
  expect(await previewHash(page)).toBe(plain);
});
