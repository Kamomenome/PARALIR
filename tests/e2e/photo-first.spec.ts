import { expect, test, type Page } from '@playwright/test';
import { waitForPreview } from './helpers';

const centre = (page: Page) =>
  page.getByTestId('preview').evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data.slice(0, 3)]);

async function withPhoto(page: Page) {
  await page.goto('/?ai=off');
  // A flat orange photo: whatever is drawn in the world, the photo itself is orange in the middle.
  const png = await page.evaluate(async () => {
    const c = new OffscreenCanvas(80, 60);
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgb(230,120,40)';
    g.fillRect(0, 0, 80, 60);
    g.fillStyle = 'rgb(40,60,200)';
    g.fillRect(0, 0, 80, 12);
    return [...new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())];
  });
  await page.setInputFiles('[data-testid="file-input"]', { name: 'orange.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await waitForPreview(page);
}

test('写真を入れると元の写真が出て、案内があり、保存は押せない（011 SC-1101）', async ({ page }) => {
  await withPhoto(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'photo');
  const [r, g, b] = await centre(page);
  expect(Math.abs(r - 230) + Math.abs(g - 120) + Math.abs(b - 40)).toBeLessThanOrEqual(9);
  await expect(page.getByTestId('photo-hint')).toBeVisible();
  await expect(page.getByTestId('photo-hint')).toContainText('元の写真です');
  await expect(page.getByTestId('export')).toBeDisabled();
  await expect(page.getByTestId('recipe-save')).toBeDisabled();
});

test('「変える」で世界になる。スライダーや囲みでも世界になる（011 SC-1102, 013 FR-1307）', async ({ page }) => {
  await withPhoto(page);
  await page.getByTestId('transform').click();
  await waitForPreview(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'world');
  await expect(page.getByTestId('photo-hint')).toBeHidden();
  await expect(page.getByTestId('export')).toBeEnabled();
  // A slider on a fresh photo shows the world too.
  await withPhoto(page);
  await page.getByTestId('space-control-light').evaluate((el: HTMLInputElement) => {
    el.value = '0.8';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitForPreview(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'world');

  // And a lasso drawn over the photo.
  await withPhoto(page);
  const box = (await page.getByTestId('preview').boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  await page.mouse.move(...at(0.5 + 0.2, 0.5));
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(...at(0.5 + 0.2 * Math.cos((2 * Math.PI * k) / 12), 0.5 + 0.2 * Math.sin((2 * Math.PI * k) / 12)));
  await page.mouse.up();
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'world', { timeout: 30_000 });
});
