import { expect, test } from '@playwright/test';
import { IMAGES, previewHash, waitForPreview } from './helpers';

async function slider(page: import('@playwright/test').Page, key: string, v: number) {
  await page.getByTestId(`space-control-${key}`).evaluate((el: HTMLInputElement, value) => {
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
}

test('「別の世界」と「別案」がなく、Space で絵は変わらない。写真のときだけ「変える」がある（013 SC-1305）', async ({ page }) => {
  await page.goto('/?ai=off');
  await expect(page.getByTestId('next-world')).toHaveCount(0);
  await expect(page.getByTestId('variation')).toHaveCount(0);
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'photo');
  await page.locator('body').press(' ');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'photo');
  await expect(page.getByTestId('transform')).toBeVisible();
  await page.getByTestId('transform').click();
  await waitForPreview(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'world');
  await expect(page.getByTestId('transform')).toBeHidden();
});

test('「ひとつ戻す」（Ctrl+Z）で直前の変更が戻る。同じスライダーの続けての変更は 1 手（013 SC-1306）', async ({ page }) => {
  // A fixed time, and a world the darkness slider works in: the picture must change for the test to mean anything.
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  await page.getByTestId('space-world').selectOption('copies');
  await waitForPreview(page);
  const start = await previewHash(page);

  for (const v of [0.6, 0.7, 0.9]) {
    await slider(page, 'darkness', v);
    await waitForPreview(page);
  }
  expect(await previewHash(page)).not.toBe(start);
  await page.getByTestId('restore-previous').click();
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(start);
  await expect(page.getByTestId('space-control-darkness')).toHaveValue('0.5');

  await page.getByTestId('space-world').selectOption('mosaic');
  await waitForPreview(page);
  await page.locator('body').press('Control+z');
  await waitForPreview(page);
  await expect(page.getByTestId('space-world')).toHaveValue('copies');
  expect(await previewHash(page)).toBe(start);
});
