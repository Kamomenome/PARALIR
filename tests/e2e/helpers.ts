import { expect, type Page } from '@playwright/test';

export const IMAGES = 'tests/fixtures/images';

/** Waits until the latest preview finished (the app sets data-render-state on the canvas). */
export async function waitForPreview(page: Page) {
  await expect(page.getByTestId('preview')).toHaveAttribute('data-render-state', 'done', { timeout: 60_000 });
}

/** Number of distinct colours in a coarse grid over the preview canvas. */
export async function previewVariety(page: Page): Promise<number> {
  return page.getByTestId('preview').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<string>();
    for (let y = 0; y < c.height; y += 16) {
      for (let x = 0; x < c.width; x += 16) {
        const i = (y * c.width + x) * 4;
        seen.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
      }
    }
    return seen.size;
  });
}

export async function previewHash(page: Page): Promise<string> {
  return page.getByTestId('preview').evaluate(async (c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const digest = await crypto.subtle.digest('SHA-256', d);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  });
}

/** A new photo is shown as it is until the first action (011): 「反映」 shows the picture (017 FR-1705). */
export async function showWorld(page: Page) {
  if ((await page.getByTestId('preview').getAttribute('data-showing')) !== 'photo') return;
  await page.getByTestId('apply').click();
  await waitForPreview(page);
}

/** 「元の画像を表示」: the photo as it is, where the lasso is drawn (019 FR-1901). */
export async function showPhotoView(page: Page) {
  if ((await page.getByTestId('preview').getAttribute('data-showing')) === 'photo') return;
  await page.getByTestId('show-photo').click();
  await expect(page.getByTestId('preview')).toHaveAttribute('data-showing', 'photo');
  await waitForPreview(page);
}

/** A rough loop of 16 points around (cx, cy) on the picture, in fractions of its box; Shift adds it (013B FR-1310). */
export async function drawLoop(page: Page, cx: number, cy: number, r: number, shift = false, ry = r) {
  const box = (await page.getByTestId('preview').boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(...at(cx + r, cy));
  await page.mouse.down();
  for (let k = 1; k <= 16; k++) await page.mouse.move(...at(cx + r * Math.cos((2 * Math.PI * k) / 16), cy + ry * Math.sin((2 * Math.PI * k) / 16)));
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}
