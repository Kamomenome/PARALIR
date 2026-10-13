import { expect, test } from '@playwright/test';
import { IMAGES, waitForPreview } from './helpers';

test('「おまかせ」はなく表記は「モード」。最初の写真ではくじのモードが選ばれ、2 枚目でも選んだモードのまま（013B SC-1308）', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-11T03:00:00Z'));
  await page.goto('/?ai=off');
  const select = page.getByTestId('space-world');
  expect(await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).not.toContain('auto');
  await expect(page.getByTestId('panel')).toContainText('モード');
  await expect(page.getByTestId('panel')).not.toContainText('テンプレート');
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/scene.png`);
  await waitForPreview(page);
  const drawn = await select.inputValue();
  expect(['copies', 'split', 'mosaic', 'echo', 'theme']).toContain(drawn);
  await select.selectOption('echo');
  await waitForPreview(page);
  await page.setInputFiles('[data-testid="file-input"]', `${IMAGES}/gradient-64x48.png`);
  await expect(page.getByTestId('source-info')).toContainText('gradient-64x48.png');
  await waitForPreview(page);
  await expect(select).toHaveValue('echo');
});
