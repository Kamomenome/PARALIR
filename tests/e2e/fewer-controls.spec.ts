import { expect, test } from '@playwright/test';
import { IMAGES, waitForPreview } from './helpers';

test.use({ timezoneId: 'Asia/Tokyo' });

test('レシピはなく、写真に合わせる強さ・光の強さ・背景の暗さも出ない（020 SC-2001, SC-2003）', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  for (const id of ['recipe-save', 'recipe-load', 'recipe-input', 'recipe-status']) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByText('レシピ')).toHaveCount(0);
  const shown = async () => (await page.locator('[data-testid^="space-control-"]').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => e.getAttribute('data-testid')!.slice('space-control-'.length))));
  for (const gone of ['featureInfluence', 'light', 'darkness']) await expect(page.getByTestId(`space-control-${gone}`)).toHaveCount(0);
  for (const name of ['写真に合わせる強さ', '光の強さ', '背景の暗さ']) await expect(page.getByTestId('panel')).not.toContainText(name);
  // The one left since 021 (FR-2101).
  expect(await shown()).toEqual(['morph']);
});
