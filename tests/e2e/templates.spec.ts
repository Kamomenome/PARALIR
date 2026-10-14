import { expect, test, type Page } from '@playwright/test';
import { IMAGES, previewHash, waitForPreview } from './helpers';

test.use({ timezoneId: 'Asia/Tokyo' });

async function withPhoto(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
}

test('表記: テンプレート・入れ子・スライダーの名前・書き出し。門と闇と光はない（017 SC-1703）', async ({ page }) => {
  await withPhoto(page);
  await expect(page.getByTestId('panel')).toContainText('モード');
  const options = await page.getByTestId('space-world').locator('option').allTextContents();
  expect(options.some((o) => o.startsWith('入れ子'))).toBe(true);
  for (const gone of ['自分で埋める', '門', '闇と光']) expect(options.some((o) => o.includes(gone)), gone).toBe(false);
  await expect(page.getByTestId('export')).toHaveText('画像を書き出す（2400×1800）');
  await page.getByTestId('space-world').selectOption('mosaic');
  // One slider since 021 (FR-2101); 写真に合わせる強さ gone in 019 (FR-1911).
  await expect(page.getByTestId('panel')).toContainText('変貌');
  await expect(page.getByTestId('panel')).not.toContainText('写真に合わせる強さ');
  await expect(page.getByTestId('panel')).not.toContainText('（闇と光）');
});

test('どのモードでも囲みが効く（017 FR-1706, 013B FR-1309）', async ({ page }) => {
  await withPhoto(page);
  for (const mode of ['copies', 'mosaic', 'echo']) {
    await page.getByTestId('space-world').selectOption(mode);
    await waitForPreview(page);
    await expect(page.getByTestId('lasso-status'), mode).toBeVisible();
  }
});

test('「反映」で絵に、「元の画像を表示」で設定はそのまま元の写真に（017 FR-1705）', async ({ page }) => {
  await withPhoto(page);
  await expect(page.getByTestId('transform')).toHaveCount(0);
  const apply = page.getByTestId('apply');
  const photo = page.getByTestId('show-photo');
  await expect(apply).toHaveText('反映');
  await expect(apply).toBeEnabled();
  await expect(photo).toBeDisabled();
  await apply.click();
  await waitForPreview(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'world');
  const world = await previewHash(page);
  await expect(apply).toBeDisabled();
  await photo.click();
  await waitForPreview(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'photo');
  await apply.click();
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(world);
});
