import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { IMAGES, waitForPreview } from './helpers';

/** A 12-megapixel PNG (a smooth gradient, so the file stays small): slow to decode, hash and analyse. */
function bigPhoto() {
  const png = new PNG({ width: 4000, height: 3000 });
  for (let y = 0; y < 3000; y++) {
    for (let x = 0; x < 4000; x++) {
      const i = (y * 4000 + x) * 4;
      png.data[i] = x & 255;
      png.data[i + 1] = y & 255;
      png.data[i + 2] = (x + y) & 255;
      png.data[i + 3] = 255;
    }
  }
  return { name: 'big.png', mimeType: 'image/png', buffer: PNG.sync.write(png) };
}

/** Every error text that ever appears, even if a later preview clears it. */
async function recordErrors(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = ((window as any).__seenErrors = []);
    const target = document.querySelector('[data-testid="errors"]')!;
    new MutationObserver(() => target.textContent && seen.push(target.textContent)).observe(target, { childList: true, subtree: true, characterData: true });
  });
}
const seenErrors = (page: Page) => page.evaluate(() => (window as any).__seenErrors as string[]);

test('写真を続けて 2 枚選ぶと、最後に選んだ写真が使われる（008 SC-804, FR-809）', async ({ page }) => {
  await page.goto('/?ai=off');
  // A large photo first, then a tiny one at once: the tiny one finishes loading first.
  await page.setInputFiles('[data-testid="file-input"]', bigPhoto());
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/gradient-64x48.png`);
  await waitForPreview(page);
  await expect(page.getByTestId('source-info')).toContainText('gradient-64x48.png');
  // Long enough for the large photo to finish too; it must not take over.
  await page.waitForTimeout(8000);
  await expect(page.getByTestId('source-info')).toContainText('gradient-64x48.png');
  await waitForPreview(page);
});

test('写真を替えた直後に「描画に失敗しました」が出ない（008 SC-804, FR-810）', async ({ page }) => {
  test.setTimeout(240_000);
  // With the AI on, each photo waits for its parts, which is when the old order went wrong.
  await page.goto('/');
  await recordErrors(page);
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await page.waitForTimeout(300);
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/gradient-64x48.png`);
  await expect(page.getByTestId('parts-status')).not.toHaveAttribute('data-state', 'pending', { timeout: 180_000 });
  await waitForPreview(page);
  await page.waitForTimeout(1000);
  expect(await seenErrors(page)).toEqual([]);
  await expect(page.getByTestId('source-info')).toContainText('gradient-64x48.png');
});
