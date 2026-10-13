import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { IMAGES, waitForPreview, showWorld } from './helpers';

const PHOTO = `${IMAGES}/gradient-64x48.png`;

async function withPhoto(page: Page) {
  await page.goto('/?ai=off');
  await page.setInputFiles('[data-testid="file-input"]', PHOTO);
  await waitForPreview(page);
  await showWorld(page);
}

const rgb = (c: string) => c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
const lum = (c: string) => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const css = (page: Page, testid: string, prop: string) => page.getByTestId(testid).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  test(`絵がいつも全体で見え、ページはスクロールしない ${viewport.width}×${viewport.height}（007 SC-701）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await withPhoto(page);
    const doc = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth }));
    expect(doc.h).toBeLessThanOrEqual(viewport.height);
    expect(doc.w).toBeLessThanOrEqual(viewport.width);
    const pic = (await page.getByTestId('preview').boundingBox())!;
    expect(pic.y).toBeGreaterThanOrEqual(0);
    expect(pic.y + pic.height).toBeLessThanOrEqual(viewport.height);
    const panel = (await page.getByTestId('panel').boundingBox())!;
    expect(panel.x).toBeGreaterThan(pic.x + pic.width - 1);
    if (viewport.width === 1440) expect(pic.width).toBeGreaterThan(960);
    else expect(pic.height).toBeGreaterThanOrEqual(viewport.height * 0.7);
    // The panel scrolls inside itself.
    expect(await css(page, 'panel', 'overflow-y')).toBe('auto');
  });
}

test('写真の入れ方: 選ぶ前は「写真を選ぶ」、ドロップで入る、入れた後は「別の写真」（007 SC-702）', async ({ page }) => {
  await page.goto('/?ai=off');
  await expect(page.getByTestId('drop')).toBeVisible();
  await expect(page.getByTestId('drop')).toContainText('写真を選ぶ');
  await expect(page.getByTestId('file-input')).toBeHidden();
  await expect(page.getByTestId('recipe-input')).toBeHidden();
  await expect(page.getByTestId('change-photo')).toBeHidden();

  const b64 = readFileSync(PHOTO).toString('base64');
  await page.getByTestId('stage').evaluate((stage, data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    stage.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    stage.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, b64);
  await waitForPreview(page);
  await expect(page.getByTestId('source-info')).toContainText('dropped.png');
  await expect(page.getByTestId('source-info')).toContainText('64×48');
  await expect(page.getByTestId('drop')).toBeHidden();
  await expect(page.getByTestId('change-photo')).toBeVisible();
  // The file name is shown once.
  await expect(page.getByText('dropped.png')).toHaveCount(1);
});

test('パネルの順番: 世界 → ひとつ戻す → スライダー → 書き出し → レシピの読み込み。詳しい設定の折りたたみはない（007 SC-703, 019 SC-1906）', async ({ page }) => {
  await withPhoto(page);
  const y = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
  // The first slider the mode shows (写真に合わせる強さ, once in every mode, left the screen in 019).
  const slider = (await page.locator('[data-testid^="space-control-"]:visible').first().boundingBox())!.y;
  const order = [await y('space-world'), await y('restore-previous'), slider, await y('export'), await y('recipe-load'), await y('tech'), await y('about')];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // Not folded away (019 FR-1913): the items are there as they are; 技術的な表示 and このアプリについて open by their headings.
  await expect(page.getByTestId('details')).toHaveCount(0);
  await expect(page.getByText('詳しい設定')).toHaveCount(0);
  await expect(page.getByTestId('recipe-load')).toBeVisible();
  for (const id of ['tech', 'about']) await expect(page.getByTestId(id)).toHaveJSProperty('open', false);
  // The artwork time is no longer set on screen (016 FR-1601).
  await expect(page.getByTestId('time-input')).toHaveCount(0);
});

test('絵についての案内は絵の下で控えめ、言葉は使う人の言葉（007 SC-704）', async ({ page }) => {
  await withPhoto(page);
  // A template that uses the lasso, so its hint is there (017 FR-1706).
  await page.getByTestId('space-world').selectOption('mosaic');
  await waitForPreview(page);
  const pic = (await page.getByTestId('preview').boundingBox())!;
  // The lasso's hint stays under the picture; what the AI saw moved to 技術的な表示 (016 FR-1604).
  const box = (await page.getByTestId('lasso-status').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(pic.y + pic.height);
  expect(parseFloat(await css(page, 'lasso-status', 'font-size'))).toBeLessThanOrEqual(13);
  expect(parseFloat(await css(page, 'parts-status', 'font-size'))).toBeLessThanOrEqual(13);
  await expect(page.getByText('直前のレシピ')).toHaveCount(0);
  await expect(page.getByTestId('restore-previous')).toContainText('ひとつ戻す');
  const options = await page.getByTestId('space-world').locator('option').allTextContents();
  for (const o of options) expect((o.match(/（/g) ?? []).length, o).toBeLessThan(2);
  await expect(page.getByTestId('world-note')).not.toBeEmpty();
});

test('画面の部品は無彩色、控えめな文字も読める（007 SC-705）', async ({ page }) => {
  await withPhoto(page);
  const grey = (c: string) => {
    const [r, g, b] = rgb(c);
    return r === g && g === b;
  };
  for (const [id, prop] of [['stage', 'background-color'], ['panel', 'background-color'], ['restore-previous', 'background-color'], ['export', 'background-color'], ['export', 'border-top-color'], ['space-control-light', 'accent-color']] as const) {
    const c = await css(page, id, prop);
    expect(grey(c), `${id} ${prop} ${c}`).toBe(true);
  }
  const muted = await css(page, 'app-version', 'color');
  const panel = await css(page, 'panel', 'background-color');
  expect(ratio(muted, panel)).toBeGreaterThanOrEqual(4.5);
});

test('手応え: バーは描いている間だけ、絵の上は十字、キャンセルは書き出し中だけ（007 SC-706）', async ({ page }) => {
  await withPhoto(page);
  await expect(page.getByTestId('progress')).toBeHidden();
  expect(await css(page, 'preview', 'cursor')).toBe('crosshair');
  await expect(page.getByTestId('export-cancel')).toBeHidden();
});

test('キーボード: Ctrl+Z でひとつ戻す、選択枠が見える（007 SC-707, 013）', async ({ page }) => {
  await withPhoto(page);
  const slider = page.getByTestId('space-control-light');
  await slider.evaluate((el: HTMLInputElement) => {
    el.value = '0.9';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitForPreview(page);
  await page.locator('body').press('Control+z');
  await waitForPreview(page);
  await expect(slider).toHaveValue('0.5');
  // A button chosen with the keyboard shows a ring of 2px or more.
  await slider.focus();
  await page.keyboard.press('Shift+Tab');
  const focused = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(focused.style).not.toBe('none');
  expect(focused.width).toBeGreaterThanOrEqual(2);
});

test('動きを減らす設定では切り替えの時間が 0（007 SC-707, FR-709）', async ({ page }) => {
  await withPhoto(page);
  const seconds = async () => (await css(page, 'preview', 'transition-duration')).split(',').map((v) => parseFloat(v));
  expect(Math.max(...(await seconds()))).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(Math.max(...(await seconds()))).toBe(0);
});
