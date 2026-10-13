import { expect, test } from '@playwright/test';

test('見出しはロゴの画像で、文字としては PARALIR のまま。アイコンは 16・32・48・180px（014 SC-1401）', async ({ page, request }) => {
  await page.goto('/?ai=off');
  const logo = page.getByTestId('logo');
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('h1')).toHaveText('PARALIR');
  const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((ls) => ls.map((l) => [l.getAttribute('rel'), l.getAttribute('sizes'), (l as HTMLLinkElement).href]));
  expect(icons.map(([rel, sizes]) => `${rel} ${sizes}`).sort()).toEqual(['apple-touch-icon 180x180', 'icon 16x16', 'icon 32x32', 'icon 48x48']);
  for (const [, , href] of icons) expect((await request.get(href!)).status(), href!).toBe(200);
});

test('「このアプリについて」に、絵の編集に AI を使っていないことが書いてある（014 SC-1403）', async ({ page }) => {
  await page.goto('/?ai=off');
  const about = page.getByTestId('about');
  await about.locator(':scope > summary').click();
  await expect(about).toContainText('画像生成AIは使っていません');
  await expect(about).toContainText('位置・輪郭');
});
