import { expect, test, type Page } from '@playwright/test';
import { IMAGES, previewHash, waitForPreview, showWorld } from './helpers';


// The artwork time is when the photo goes in (016 FR-1601): the browser's clock and time zone are fixed instead.
test.use({ timezoneId: 'Asia/Tokyo' });
test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z')));

async function openWithFixedTime(page: Page) {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/gradient-64x48.png`);
  await waitForPreview(page);
  await showWorld(page);
}

async function setSlider(page: Page, key: string, value: number) {
  await page.getByTestId(`space-control-${key}`).evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('連続操作では最後の値の結果だけが表示される（R12）', async ({ page }) => {
  test.setTimeout(180_000);
  await openWithFixedTime(page);
  for (let i = 0; i <= 10; i++) await setSlider(page, 'morph', i / 10);
  await setSlider(page, 'morph', 0.37);
  await waitForPreview(page);
  await page.waitForTimeout(500);
  await waitForPreview(page);
  const rapid = await previewHash(page);

  await openWithFixedTime(page);
  await setSlider(page, 'morph', 0.37);
  await waitForPreview(page);
  expect(await previewHash(page)).toBe(rapid);
});

test('描画が失敗しても設定は残り、次の操作で描画できる（R12）', async ({ page }) => {
  await openWithFixedTime(page);
  await setSlider(page, 'morph', 0.3);
  await waitForPreview(page);
  await page.evaluate(() => ((window as any).__paralirInjectFailure = true));
  await setSlider(page, 'morph', 0.6);
  await expect(page.getByTestId('errors')).toContainText('描画に失敗しました');
  await expect(page.getByTestId('space-control-morph')).toHaveValue('0.6');
  await setSlider(page, 'morph', 0.65);
  await waitForPreview(page);
});
