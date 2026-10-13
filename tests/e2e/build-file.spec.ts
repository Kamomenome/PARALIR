import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { previewVariety, waitForPreview } from './helpers';

// The download version: one HTML file, opened by double-click (009 FR-916).
const dist = resolve('dist-single/index.html');

test('ビルドした単一 HTML を file:// で開いて生成でき、HTTP 通信が 0 件、CSP の下で AI も動く（Q13, FR-002, 008 FR-812）', async ({ page }) => {
  test.setTimeout(240_000);
  test.skip(!existsSync(dist), 'npm run build:single を先に実行してください');
  // The browser itself refuses connections too, not only the app's own blocking (008 FR-812).
  const html = readFileSync(dist, 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
  expect(csp).toContain("default-src 'none'");
  expect(csp).toMatch(/connect-src [^;]*/);
  expect(csp.match(/connect-src ([^;]*)/)![1]).not.toMatch(/https?:|\*/);
  const http: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) http.push(r.url());
  });
  await page.addInitScript(() => {
    (window as any).__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as any).__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(pathToFileURL(dist).href);
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await waitForPreview(page);
  expect(await previewVariety(page)).toBeGreaterThan(200);
  // Real (parallel) workers start on file://, so the in-thread fallback notice is absent.
  await expect(page.getByTestId('notices')).not.toContainText('Web Worker');
  // The on-device AI (wasm and models inlined) runs under the policy.
  await expect(page.getByTestId('parts-status')).toHaveAttribute('data-state', /^(person|object|none)$/, { timeout: 180_000 });
  expect(http).toEqual([]);
  // MediaPipe's usage log is refused by the policy as well; nothing else may be.
  const violations: string[] = await page.evaluate(() => (window as any).__violations);
  expect(violations.filter((v) => !v.includes('googleapis.com'))).toEqual([]);
});
