import { expect, test } from '@playwright/test';
import { IMAGES, drawLoop, previewHash, showPhotoView, showWorld, waitForPreview } from './helpers';

test('囲みの線だけを隠せて、絵は変わらない。「囲みを解除」で効果が取り消される（011 SC-1104）', async ({ page }) => {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  await showWorld(page);
  await page.getByTestId('space-world').selectOption('mosaic');
  await waitForPreview(page);
  const before = await previewHash(page);
  // The lasso is drawn on the photo (019 FR-1901); its line and range show there.
  await showPhotoView(page);
  const photo = await previewHash(page);
  await drawLoop(page, 0.45, 0.5, 0.15, false, 0.2);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^lasso/, { timeout: 30_000 });
  await waitForPreview(page);
  const overlay = page.getByTestId('lasso-overlay');
  await expect(overlay).toBeVisible();

  const toggle = page.getByTestId('lasso-outline');
  await expect(toggle).toHaveText('線を隠す');
  await toggle.click();
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId('lasso-range')).toBeHidden();
  await expect(toggle).toHaveText('線を出す');
  expect(await previewHash(page)).toBe(photo);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^lasso/);
  await toggle.click();
  await expect(overlay).toBeVisible();
  await page.getByTestId('apply').click();
  await waitForPreview(page);
  expect(await previewHash(page)).not.toBe(before);

  await expect(page.getByTestId('lasso-clear')).toHaveText('囲みを解除');
  await page.getByTestId('lasso-clear').click();
  await waitForPreview(page);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', 'none');
  expect(await previewHash(page)).toBe(before);
});
