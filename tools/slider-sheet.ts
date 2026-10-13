// Slider comparison for 019 (FR-1912): each mode of each photo, every slider the mode shows at 0, 0.5 and 1 (the others
// as they start), drawn by the app itself in a headless browser with its on-device AI. Nothing leaves the device.
// Usage: npx tsx tools/slider-sheet.ts photo.jpg [photo2.jpg ...] --out out/019
// Writes <out>/<photo>/<mode>-<slider>-<value>.png and <out>/index.html to look at them side by side.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { createServer } from 'vite';
import { WORLDS } from '../src/engine/space-v2/worlds';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : 'out/019';
const photos = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
const VALUES = [0, 0.5, 1];
const NAMES: Record<string, string> = { light: '光の強さ', lightShape: '光の形', darkness: '背景の暗さ', size: '主役の大きさ', count: '長方形の数' };
const PORT = 5197;
const BASE = `http://localhost:${PORT}`;

async function done(page: Page) {
  await page.waitForFunction(() => document.querySelector('[data-testid="preview"]')?.getAttribute('data-render-state') === 'done', null, { timeout: 180_000 });
}

async function setSlider(page: Page, key: string, v: number) {
  await page.getByTestId(`space-control-${key}`).evaluate((el: HTMLInputElement, value) => {
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await done(page);
}

const grab = (page: Page) => page.getByTestId('preview').evaluate((c: HTMLCanvasElement) => c.toDataURL('image/png').split(',')[1]);

interface Row {
  photo: string;
  mode: string;
  label: string;
  key: string;
  start: string;
  files: string[];
}

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const rows: Row[] = [];
const skipped: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Tokyo' });
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(BASE)) external.push(r.url());
  });
  for (const file of photos) {
    const name = basename(file, extname(file));
    mkdirSync(join(out, name), { recursive: true });
    for (const w of WORLDS) {
      const t0 = Date.now();
      // A fresh work for each mode, so every slider starts where the mode starts it (光の形: the drawn shape).
      await page.clock.setFixedTime(new Date('2026-10-13T03:00:00Z'));
      await page.goto(BASE);
      await page.setInputFiles('[data-testid="file-input"]', file);
      await done(page);
      await page.waitForFunction(() => document.querySelector('[data-testid="parts-status"]')?.getAttribute('data-state') !== 'pending', null, { timeout: 180_000 });
      const option = page.getByTestId('space-world').locator(`option[value="${w.type}"]`);
      if (await option.isDisabled()) {
        skipped.push(`${name}: ${w.label}（主役が見つからない写真では選べません）`);
        continue;
      }
      await page.getByTestId('space-world').selectOption(w.type);
      await done(page);
      for (const key of w.controls) {
        const slider = page.getByTestId(`space-control-${key}`);
        const start = await slider.inputValue();
        const files: string[] = [];
        for (const v of VALUES) {
          await setSlider(page, key, v);
          const f = `${name}/${w.type}-${key}-${v}.png`;
          writeFileSync(join(out, f), Buffer.from(await grab(page), 'base64'));
          files.push(f);
        }
        await setSlider(page, key, Number(start));
        rows.push({ photo: name, mode: w.type, label: w.label, key, start, files });
      }
      console.log(`${name} ${w.label} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }
  if (external.length) throw new Error(`external requests: ${external.join(', ')}`);
} finally {
  await browser.close();
  await server.close();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const sections = WORLDS.map((w) => {
  const mine = rows.filter((r) => r.mode === w.type);
  if (!mine.length) return '';
  const sliders = [...new Set(mine.map((r) => r.key))].map((key) => {
    const end = (v: number) => (key === 'lightShape' ? (v === 0 ? '0（輪）' : v === 1 ? '1（まっすぐ）' : String(v)) : String(v));
    const body = mine
      .filter((r) => r.key === key)
      .map((r) => `<tr><th>${esc(r.photo)}<br><small>最初 ${esc(r.start)}</small></th>${r.files.map((f) => `<td><img src="${esc(f)}" loading="lazy"></td>`).join('')}</tr>`)
      .join('');
    return `<h3>${esc(NAMES[key] ?? key)}</h3><table><tr><th></th>${VALUES.map((v) => `<th>${end(v)}</th>`).join('')}</tr>${body}</table>`;
  });
  return `<section><h2>${esc(w.label)}</h2><p>${esc(w.note)}</p>${sliders.join('')}</section>`;
});
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>スライダーの比較（019）</title><style>
body{font-family:system-ui,sans-serif;background:#1b1b1b;color:#ddd;margin:24px}h2{margin-top:40px}table{border-collapse:collapse}
th,td{padding:4px;vertical-align:middle}th{font-weight:normal;color:#aaa;text-align:left}img{width:320px;display:block}</style></head><body>
<h1>スライダーの比較（019 FR-1912）</h1><p>モードごとに、出るスライダーを 1 つずつ 0・0.5・1 に動かした絵（ほかは最初の位置）。作品日時 2026-10-13 12:00。</p>
${skipped.length ? `<p>出せなかったもの: ${skipped.map(esc).join('、')}</p>` : ''}${sections.join('')}</body></html>\n`,
);
console.log(`${join(out, 'index.html')} (${rows.length} sliders)`);
