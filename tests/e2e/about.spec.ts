import { expect, test } from '@playwright/test';

test('「このアプリについて」で、ライセンス・プライバシー・AI の用途の注意・部品のライセンスが読める（009 FR-913, SC-904）', async ({ page }) => {
  await page.goto('/?ai=off');
  const about = page.getByTestId('about');
  await expect(about).toBeVisible();
  await about.locator('summary').click();
  await expect(about).toContainText('MIT');
  await expect(about).toContainText('外部へ送信することはありません');
  await expect(about).toContainText('監視');
  await expect(about).toContainText(/ver \d+\.\d+/);
  await expect(about).toContainText('commit');
  // The full notices, as shipped.
  await expect(page.getByTestId('notices-text')).toContainText('Apache License');
  await expect(page.getByTestId('notices-text')).toContainText('temporal-polyfill');
});

test('「このアプリについて」は利用者の文（019 SC-1906）', async ({ page }) => {
  await page.goto('/?ai=off');
  const about = page.getByTestId('about');
  await about.locator(':scope > summary').click();
  const version = (await about.locator('p').first().textContent())!.match(/^PARALIR ver (\d+\.\d+)（commit ([^）]+)）/);
  expect(version).not.toBeNull();
  for (const line of [
    `PARALIR ver ${version![1]}（commit ${version![2]}）は、MITライセンスで公開している、誰でも無料で使えるアプリです。`,
    '写真の処理はすべて端末内で行い、外部へ送信することはありません。人物や物の位置・輪郭を読み取るAIも端末内で動作し、外部への通信はアプリとブラウザの両方で遮断しています。',
    '画像を崩す、組み替える、複製する、光を描くといった表現は、すべて決められた計算の組み合わせで作り出しています。画像生成AIは使っていません。',
    'AIの役割は、写真に写っている人物や物の位置・輪郭を読み取ることだけです。AIが使えない場合も、写真の情報からそれらを推定して描画します。',
    '使用しているAIモデル（Google MediaPipe）は、監視や個人の識別、命に関わる判断への利用を想定していません。PARALIRでは、絵を作るためにのみ使用しています。',
  ])
    await expect(about.locator('p', { hasText: line })).toHaveCount(1);
});
