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

/** Opens 「詳しい設定」 (007 FR-703), where the artwork time and recipe loading live. */
export async function openDetails(page: Page) {
  const details = page.getByTestId('details');
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator(':scope > summary').click();
}

/** A new photo is shown as it is until the first action (011): the first 別の世界 shows the world (variation 0). */
export async function showWorld(page: Page) {
  if ((await page.getByTestId('preview').getAttribute('data-showing')) !== 'photo') return;
  await page.getByTestId('next-world').click();
  await waitForPreview(page);
}
