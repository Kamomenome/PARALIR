import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { previewVariety, waitForPreview } from './helpers';

// FR-223 / SC-210: a standard iPhone-size photo (4032×3024 ≈ 12.19 MP) is reduced, not refused.
test('4032×3024 の写真が拒否されずに読み込まれる（FR-223）', async ({ page }) => {
  test.setTimeout(180_000);
  const w = 4032;
  const h = 3024;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      png.data[i] = (x >> 4) & 255;
      png.data[i + 1] = (y >> 4) & 255;
      png.data[i + 2] = ((x ^ y) >> 5) & 255;
      png.data[i + 3] = 255;
    }
  }
  mkdirSync('test-results', { recursive: true });
  const file = 'test-results/large-4032x3024.png';
  writeFileSync(file, PNG.sync.write(png, { deflateLevel: 1 }));
  await page.goto('/');
  await page.setInputFiles('[data-testid="file-input"]', file);
  await waitForPreview(page);
  await expect(page.getByTestId('notices')).not.toContainText('画素数が多すぎます');
  expect(await previewVariety(page)).toBeGreaterThan(50);
});
