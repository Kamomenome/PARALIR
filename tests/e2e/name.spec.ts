import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { previewVariety, waitForPreview } from './helpers';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version.split('.').slice(0, 2).join('.');

test('PARALIR: 名前と版（010 SC-1001）、開いたら空間モードだけ、古いモードの欄はない（006 SC-601, SC-602）', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await expect(page).toHaveTitle('PARALIR');
  await expect(page.locator('h1')).toHaveText('PARALIR');
  await expect(page.getByTestId('app-version')).toHaveText(`ver ${version}`);
  // No mode switch and none of the old modes' controls.
  await expect(page.getByTestId('mode-switch')).toHaveCount(0);
  await expect(page.getByTestId('control-fineness')).toHaveCount(0);
  await expect(page.getByTestId('reset-composition')).toHaveCount(0);
  await expect(page.getByText('見た目の比較')).toHaveCount(0);
  await expect(page.getByText('診断表示')).toHaveCount(0);

  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await waitForPreview(page);
  await expect(page.getByTestId('space-panel')).toBeVisible();
  await expect(page.getByTestId('space-world')).toBeVisible();
  expect(await previewVariety(page)).toBeGreaterThan(50);

  await expect(page.getByTestId('export-quality')).toHaveCount(0);
  const download = page.waitForEvent('download', { timeout: 240_000 });
  await page.getByTestId('export').click();
  expect((await download).suggestedFilename()).toMatch(/^paralir-.*\.png$/);
});

test('以前のモードのレシピは理由を出して読まない（006 SC-603）', async ({ page }) => {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await waitForPreview(page);
  for (const engineVersion of ['world-v3', 'reference-v1', 'space-v1']) {
    const recipe = { schemaVersion: 1, engineVersion, variationIndex: 0 };
    await page.setInputFiles('[data-testid="recipe-input"]', { name: `${engineVersion}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(recipe)) });
    await expect(page.getByTestId('recipe-status'), engineVersion).toContainText('以前のモードの作品です');
  }
});
