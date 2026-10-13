import { expect, test } from '@playwright/test';
import { IMAGES, previewHash, showWorld, waitForPreview } from './helpers';

test('囲みの線だけを隠せて、絵は変わらない。「囲みを解除」で効果が取り消される（011 SC-1104）', async ({ page }) => {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  await showWorld(page);
  await page.getByTestId('space-world').selectOption('mosaic');
  await waitForPreview(page);
  const before = await previewHash(page);
  const box = (await page.getByTestId('preview').boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  await page.mouse.move(...at(0.6, 0.5));
  await page.mouse.down();
  for (let k = 1; k <= 16; k++) await page.mouse.move(...at(0.45 + 0.15 * Math.cos((2 * Math.PI * k) / 16), 0.5 + 0.2 * Math.sin((2 * Math.PI * k) / 16)));
  await page.mouse.up();
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^lasso/, { timeout: 30_000 });
  await waitForPreview(page);
  const lassoed = await previewHash(page);
  expect(lassoed).not.toBe(before);
  const overlay = page.getByTestId('lasso-overlay');
  await expect(overlay).toBeVisible();

  const toggle = page.getByTestId('lasso-outline');
  await expect(toggle).toHaveText('線を隠す');
  await toggle.click();
  await expect(overlay).toBeHidden();
  await expect(toggle).toHaveText('線を出す');
  expect(await previewHash(page)).toBe(lassoed);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^lasso/);
  await toggle.click();
  await expect(overlay).toBeVisible();

  await expect(page.getByTestId('lasso-clear')).toHaveText('囲みを解除');
  await page.getByTestId('lasso-clear').click();
  await waitForPreview(page);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', 'none');
  expect(await previewHash(page)).toBe(before);
});
