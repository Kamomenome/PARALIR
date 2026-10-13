import { expect, test } from '@playwright/test';
import { IMAGES, waitForPreview } from './helpers';

test('枠の外にファイルを落としても、ブラウザがファイルを開かない（008 FR-815, SC-805）', async ({ page }) => {
  await page.goto('/?ai=off');
  const prevented = await page.getByTestId('panel').evaluate((panel) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.png', { type: 'image/png' }));
    const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
    const drop = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    panel.dispatchEvent(over);
    panel.dispatchEvent(drop);
    return [over.defaultPrevented, drop.defaultPrevented];
  });
  expect(prevented).toEqual([true, true]);
});

test('囲みは左ボタンで、少しでも動かしたときだけ（008 FR-816, SC-805）', async ({ page }) => {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/gradient-64x48.png`);
  await waitForPreview(page);
  // A template that uses the lasso (017 FR-1706).
  await page.getByTestId('space-world').selectOption('mosaic');
  await waitForPreview(page);
  const box = (await page.getByTestId('preview').boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  const loop = async (button: 'left' | 'right', r: number) => {
    await page.mouse.move(...at(0.5 + r, 0.5));
    await page.mouse.down({ button });
    for (let k = 1; k <= 12; k++) await page.mouse.move(...at(0.5 + r * Math.cos((2 * Math.PI * k) / 12), 0.5 + r * Math.sin((2 * Math.PI * k) / 12)));
    await page.mouse.up({ button });
  };
  await loop('right', 0.2);
  await loop('left', 0.002);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', 'none');
  await loop('left', 0.2);
  await expect(page.getByTestId('lasso-status')).toHaveAttribute('data-source', /^lasso/, { timeout: 30_000 });
});
