import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { IMAGES, waitForPreview, showWorld } from './helpers';


// The artwork time is when the photo goes in (016 FR-1601): the browser's clock and time zone are fixed instead.
test.use({ timezoneId: 'Asia/Tokyo' });
test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z')));

async function open(page: Page) {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/gradient-64x48.png`);
  await waitForPreview(page);
  await showWorld(page);
}

async function slider(page: Page, key: string, v: number) {
  await page.getByTestId(`space-control-${key}`).evaluate((el: HTMLInputElement, value) => {
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
}

async function exportPng(page: Page, during?: () => Promise<void>) {
  const download = page.waitForEvent('download', { timeout: 240_000 });
  await page.getByTestId('export').click();
  if (during) await during();
  const d = await download;
  return PNG.sync.read(readFileSync((await d.path())!));
}

test('書き出しは開始時の設定で固定され、2400×1800 になる（R11, R09）', async ({ page }) => {
  test.setTimeout(600_000);
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.host !== 'localhost:5173') external.push(r.url());
  });
  await open(page);
  // A mode, and 変貌 moved during the export (021).
  await page.getByTestId('space-world').selectOption('copies');
  await slider(page, 'morph', 0.3);
  await waitForPreview(page);

  const a = await exportPng(page, () => slider(page, 'morph', 0.9));
  expect([a.width, a.height]).toEqual([2400, 1800]);

  await slider(page, 'morph', 0.3);
  await waitForPreview(page);
  const b = await exportPng(page);
  expect(Buffer.compare(a.data, b.data)).toBe(0);

  expect(external).toEqual([]);
});

test('書き出しはキャンセルでき、PNG は保存されない（R11）', async ({ page }) => {
  await open(page);
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  await page.getByTestId('export').click();
  await page.getByTestId('export-cancel').click();
  await expect(page.getByTestId('export-status')).toContainText('キャンセル');
  await page.waitForTimeout(3000);
  expect(downloaded).toBe(false);
});
