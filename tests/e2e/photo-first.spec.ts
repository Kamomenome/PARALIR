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
});

test('「反映」で絵になる。スライダーでも絵になる（011 SC-1102, 017 FR-1705）', async ({ page }) => {
  await withPhoto(page);
  await page.getByTestId('apply').click();
  await waitForPreview(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'world');
  await expect(page.getByTestId('photo-hint')).toBeHidden();
  await expect(page.getByTestId('export')).toBeEnabled();
  // A slider on a fresh photo shows the world too.
  await withPhoto(page);
  await page.getByTestId('space-control-size').evaluate((el: HTMLInputElement) => {
    el.value = '0.8';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitForPreview(page);
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'world');
});
