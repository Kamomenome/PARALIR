import { expect, test } from '@playwright/test';
import { openDetails } from './helpers';

test('「このアプリについて」で、ライセンス・プライバシー・AI の用途の注意・部品のライセンスが読める（009 FR-913, SC-904）', async ({ page }) => {
  await page.goto('/?ai=off');
  await openDetails(page);
  const about = page.getByTestId('about');
  await expect(about).toBeVisible();
  await about.locator('summary').click();
  await expect(about).toContainText('MIT');
  await expect(about).toContainText('写真は端末の外へ送りません');
  await expect(about).toContainText('監視');
  await expect(about).toContainText(/ver \d+\.\d+/);
  await expect(about).toContainText('commit');
  // The full notices, as shipped.
  await expect(page.getByTestId('notices-text')).toContainText('Apache License');
  await expect(page.getByTestId('notices-text')).toContainText('temporal-polyfill');
});
