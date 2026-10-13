import { expect, test } from '@playwright/test';

const IMAGES = 'tests/fixtures/images';

test.describe('写真の読込（R01）', () => {
  test('EXIF Orientation=6 の JPEG は正立して 20×40 になる', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/exif-rotated.jpg`);
    await expect(page.getByTestId('source-info')).toContainText('20×40');
  });

  test('半透明の PNG は白で合成され、その旨が通知される', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/translucent.png`);
    await expect(page.getByTestId('source-info')).toContainText('16×16');
    await expect(page.getByTestId('notices')).toContainText('白');
  });

  test('上限を超える画像は理由つきで拒否される', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/huge-header.png`);
    await expect(page.getByTestId('errors')).toContainText('画素');
    await expect(page.getByTestId('source-info')).not.toContainText('8000');
  });

  test('壊れたファイルは理由つきで拒否される', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/broken.jpg`);
    await expect(page.getByTestId('errors')).toContainText('読み込めません');
  });
});
