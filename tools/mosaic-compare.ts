// Comparison sheets for 015: the rectangles world of each photo with its hole filled six ways (今・A・B・C・D1・D2),
// at ふつう and 多い rectangles. Runs the app's code in a headless browser; the photos never leave the device.
// Usage: npx tsx tools/mosaic-compare.ts photo.jpg [photo2.jpg ...] --out out/015
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : 'out/015';
const photos = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith('http://localhost:5198')) external.push(r.url());
  });
  await page.goto('http://localhost:5198/tools/mosaic-compare.html');
  await page.waitForFunction(() => (window as any).__ready === true);
  for (const file of photos) {
    const t0 = Date.now();
    const png = await page.evaluate(([n, b]) => (window as any).__sheet(n, b), [basename(file), readFileSync(file).toString('base64')] as const);
    const target = join(out, `${basename(file, extname(file))}-compare.png`);
    writeFileSync(target, Buffer.from(png, 'base64'));
    console.log(`${target} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  if (external.length) throw new Error(`external requests: ${external.join(', ')}`);
} finally {
  await browser.close();
  await server.close();
}
