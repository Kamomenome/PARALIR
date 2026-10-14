import { expect, test } from '@playwright/test';
import { IMAGES, waitForPreview } from './helpers';

test.use({ timezoneId: 'Asia/Tokyo' });

test('スライダーは「変貌」1 本だけで、最初は 0.5。モードは選べる（021 SC-2101）', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  for (const mode of ['copies', 'split', 'mosaic', 'echo', 'theme']) {
    await page.getByTestId('space-world').selectOption(mode);
    await waitForPreview(page);
    await expect(page.locator('[data-testid^="space-control-"]:visible'), mode).toHaveCount(1);
    await expect(page.getByTestId('space-control-morph')).toBeVisible();
    await expect(page.getByTestId('space-control-morph')).toHaveValue('0.5');
  }
  await expect(page.getByTestId('panel')).toContainText('変貌');
  for (const gone of ['光の形', '主役の大きさ', '長方形の数']) await expect(page.getByTestId('panel')).not.toContainText(gone);
});
