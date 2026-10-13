import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { previewVariety, waitForPreview } from './helpers';

const PORT = 4174;
const ORIGIN = `http://localhost:${PORT}`;
let server: ChildProcess | null = null;

test.beforeAll(async () => {
  if (!existsSync('dist/index.html')) return;
  // The web build served as static files, the way GitHub Pages serves it (009 FR-915).
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite preview did not start');
});
test.afterAll(() => server?.kill());

test('Web 版: 静的に配信して開くと描けて AI も動き、外への通信 0 件、CSP の違反なし（009 FR-915, FR-917, SC-905）', async ({ page }) => {
  test.setTimeout(240_000);
  test.skip(!existsSync('dist/index.html'), 'npm run build を先に実行してください');
  // Several small files, not one: the models and the wasm are their own files, cached across versions.
  const html = readFileSync('dist/index.html', 'utf8');
  expect(statSync('dist/index.html').size).toBeLessThan(100_000);
  const assets = readdirSync(join('dist', 'assets'));
  expect(assets.some((f) => f.endsWith('.tflite'))).toBe(true);
  expect(assets.some((f) => f.endsWith('.wasm'))).toBe(true);
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
  expect(csp).toContain("default-src 'none'");
  expect(csp.match(/connect-src ([^;]*)/)![1]).not.toMatch(/https?:|\*/);
  expect(csp.match(/script-src ([^;]*)/)![1]).not.toContain("'unsafe-inline'");

  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== ORIGIN) external.push(r.url());
  });
  await page.addInitScript(() => {
    (window as any).__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as any).__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(`${ORIGIN}/`);
  await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/images/scene.png');
  await waitForPreview(page);
  expect(await previewVariety(page)).toBeGreaterThan(50);
  await expect(page.getByTestId('parts-status')).toHaveAttribute('data-state', /^(person|object|none)$/, { timeout: 180_000 });
  expect(external).toEqual([]);
  const violations: string[] = await page.evaluate(() => (window as any).__violations);
  expect(violations.filter((v) => !v.includes('googleapis.com'))).toEqual([]);
});
