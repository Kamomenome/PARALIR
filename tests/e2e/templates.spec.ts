import { expect, test, type Page } from '@playwright/test';
import { IMAGES, previewHash, waitForPreview } from './helpers';

test.use({ timezoneId: 'Asia/Tokyo' });

async function withPhoto(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
}

const shown = async (page: Page) => {
  const out: string[] = [];
  for (const k of ['lightShape', 'size', 'count']) if (await page.getByTestId(`space-control-${k}`).isVisible()) out.push(k);
  return out;
};

test('表記: テンプレート・入れ子・スライダーの名前・書き出し。門と闇と光はない（017 SC-1703）', async ({ page }) => {
  await withPhoto(page);
  await expect(page.getByTestId('panel')).toContainText('モード');
  const options = await page.getByTestId('space-world').locator('option').allTextContents();
  expect(options.some((o) => o.startsWith('入れ子'))).toBe(true);
  for (const gone of ['自分で埋める', '門', '闇と光']) expect(options.some((o) => o.includes(gone)), gone).toBe(false);
  await expect(page.getByTestId('export')).toHaveText('画像を書き出す（2400×1800）');
  await page.getByTestId('space-world').selectOption('mosaic');
  await expect(page.getByTestId('panel')).toContainText('長方形の数');
  // Gone from the screen in 019 (FR-1911).
  await expect(page.getByTestId('panel')).not.toContainText('写真に合わせる強さ');
  await expect(page.getByTestId('panel')).not.toContainText('（闇と光）');
});

test('テンプレートで効くスライダーと囲みだけが出る（017 FR-1704, FR-1706）', async ({ page }) => {
  await withPhoto(page);
  await page.getByTestId('space-world').selectOption('copies');
  await waitForPreview(page);
  expect(await shown(page)).toEqual(['lightShape', 'size']);
  // The lasso decides the subject in every template since 013B (FR-1309).
  await expect(page.getByTestId('lasso-status')).toBeVisible();
  await page.getByTestId('space-world').selectOption('mosaic');
  await waitForPreview(page);
  expect(await shown(page)).toEqual(['count']);
  await expect(page.getByTestId('lasso-status')).toBeVisible();
  await page.getByTestId('space-world').selectOption('echo');
  await waitForPreview(page);
  expect(await shown(page)).toEqual(['size']);
});

test('スライダーは「背景」「主役」「全体」の見出しで分かれる（017 SC-1705）', async ({ page }) => {
  await withPhoto(page);
  const headings = async () => (await page.locator('[data-testid="slider-group"]:visible > .group-title').allTextContents()).map((t) => t.trim());
  await page.getByTestId('space-world').selectOption('copies');
  expect(await headings()).toEqual(['背景', '主役']);
  await page.getByTestId('space-world').selectOption('mosaic');
  expect(await headings()).toEqual(['主役']);
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
