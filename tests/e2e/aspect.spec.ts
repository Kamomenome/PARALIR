import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { showWorld, waitForPreview } from './helpers';

/** A 3:2 photo with a red border, a blue corner and green inside: whether the edges are kept is plain to see. */
function widePhoto() {
  const png = new PNG({ width: 600, height: 400 });
  for (let y = 0; y < 400; y++) {
    for (let x = 0; x < 600; x++) {
      const i = (y * 600 + x) * 4;
      const edge = x < 12 || y < 12 || x >= 588 || y >= 388;
      const corner = x < 40 && y < 40;
      png.data.set(corner ? [20, 40, 230, 255] : edge ? [230, 30, 30, 255] : [40, 180, 60, 255], i);
    }
  }
  return { name: 'wide.png', mimeType: 'image/png', buffer: PNG.sync.write(png) };
}

test('3:2 の写真は 3:2 のまま。元の写真は切れず、書き出しは 2400×1600（018 SC-1802）', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', widePhoto());
  await waitForPreview(page);
  const canvas = page.getByTestId('preview');
  expect(await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([960, 640]);
  const box = (await canvas.boundingBox())!;
  expect(Math.abs(box.width / box.height - 1.5)).toBeLessThan(0.02);
  // The photo as it is: the corner and the border are there, nothing cut off.
  const px = (x: number, y: number) => canvas.evaluate((c: HTMLCanvasElement, [px, py]) => [...c.getContext('2d')!.getImageData(px, py, 1, 1).data.slice(0, 3)], [x, y]);
  const [r0, , b0] = await px(4, 4);
  expect(b0).toBeGreaterThan(150);
  expect(r0).toBeLessThan(100);
  const [r1] = await px(955, 635);
  expect(r1).toBeGreaterThan(150);

  await showWorld(page);
  await expect(page.getByTestId('export')).toHaveText('画像を書き出す（2400×1600）');
  const download = page.waitForEvent('download', { timeout: 240_000 });
  await page.getByTestId('export').click();
  const png = PNG.sync.read(readFileSync((await (await download).path())!));
  expect([png.width, png.height]).toEqual([2400, 1600]);
});
