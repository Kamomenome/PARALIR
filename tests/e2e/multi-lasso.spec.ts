import { expect, test, type Page } from '@playwright/test';
import { IMAGES, previewHash, waitForPreview } from './helpers';

async function loop(page: Page, cx: number, cy: number, r: number, shift = false) {
  const box = (await page.getByTestId('preview').boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(...at(cx + r, cy));
  await page.mouse.down();
  for (let k = 1; k <= 16; k++) await page.mouse.move(...at(cx + r * Math.cos((2 * Math.PI * k) / 16), cy + r * Math.sin((2 * Math.PI * k) / 16)));
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^lasso/, { timeout: 30_000 });
  await waitForPreview(page);
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

  await loop(page, 0.25, 0.4, 0.12);
  await expect(lines).toHaveCount(1);
  const one = await previewHash(page);
  expect(one).not.toBe(plain);
  await loop(page, 0.7, 0.6, 0.12, true);
  await expect(lines).toHaveCount(2);
  expect(await previewHash(page)).not.toBe(one);
  await loop(page, 0.5, 0.5, 0.1);
  await expect(lines).toHaveCount(1);
  await page.getByTestId('lasso-clear').click();
  await waitForPreview(page);
  await expect(lines).toHaveCount(0);
  expect(await previewHash(page)).toBe(plain);
});
