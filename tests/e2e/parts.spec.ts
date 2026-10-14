import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { waitForPreview, showWorld } from './helpers';

// file:// opens the download version (009 FR-916).
const dist = resolve('dist-single/index.html');

async function spaceWithPhoto(page: Page) {
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await waitForPreview(page);
  await showWorld(page);
}

test('file:// のビルドで AI が写真の部品を作り、同じ写真なら同じ部品、HTTP 通信 0 件（004 SC-404, SC-405）', async ({ page }) => {
  test.skip(!existsSync(dist), 'npm run build:single を先に実行してください');
  test.setTimeout(400_000);
  const http: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) http.push(r.url());
  });
  await page.goto(pathToFileURL(dist).href);
  await spaceWithPhoto(page);
  const status = page.getByTestId('parts-status');
  // The reference photo has no person: the object at the estimated subject is cut out.
  await expect(status).toHaveAttribute('data-state', 'object', { timeout: 180_000 });
  await expect(status).toContainText('人物なし');
  const digest = await status.getAttribute('data-digest');
  expect(digest).toMatch(/^[0-9a-f]{16}$/);

  await page.reload();
  await spaceWithPhoto(page);
  await expect(status).toHaveAttribute('data-state', 'object', { timeout: 180_000 });
  expect(await status.getAttribute('data-digest')).toBe(digest);
  expect(http).toEqual([]);
});

test('AI を止めると推定で描き、知らせる（004 SC-406）', async ({ page }) => {
  await page.goto('/?ai=off');
  await spaceWithPhoto(page);
  const status = page.getByTestId('parts-status');
  await expect(status).toHaveAttribute('data-state', 'off');
  await expect(status).toContainText('部品の見分けなし（推定で描画）');
});
