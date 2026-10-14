// Light shapes side by side (021 FR-2105, FR-2107): each photo's copies world at 変貌 0.5, with the light forced to each
// shape (ring, swirl, cracks, flame, scatter), and at 変貌 1 to see the colours. AI off. A headless browser only decodes
// the photos (shrunk to 1200 px); nothing leaves the device.
// Usage: npx tsx tools/light-sheet.ts photo.jpg [photo2.jpg ...] --out out/021-light
// Writes <out>/<photo>/<shape>-<morph>.png and <out>/index.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { createInitialState, prepareSource, withSource } from '../src/app/state';
import type { RgbImage } from '../src/engine/common/image/normalize';
import { LIGHT_SHAPES, sphereTiltFor } from '../src/engine/space-v2/shared/atmosphere';
import { renderWorld, type SpaceWorld } from '../src/engine/space-v2/world';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : 'out/021-light';
const photos = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
const NAMES: Record<string, string> = { ring: '輪', swirl: '渦', cracks: 'ひび割れ', flame: '炎', scatter: '散らばった光源' };
const MORPHS = [0.5, 1];
const LONG = 640;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('**/*', (r) => r.abort());
/** The photo as RGB, its long side at most 1200 px (decoded by the browser, as the app does). */
async function decodeImage(bytes: Buffer): Promise<RgbImage> {
  const { w, h, b64 } = await page.evaluate(async (data) => {
    const blob = await (await fetch(`data:application/octet-stream;base64,${data}`)).blob();
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const rgb = new Uint8Array((d.length / 4) * 3);
    for (let i = 0, j = 0; i < d.length; i += 4) {
      rgb[j++] = d[i];
      rgb[j++] = d[i + 1];
      rgb[j++] = d[i + 2];
    }
    let s = '';
    for (let i = 0; i < rgb.length; i += 0x8000) s += String.fromCharCode(...rgb.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, b64: btoa(s) };
  }, bytes.toString('base64'));
  return { width: w, height: h, data: new Uint8Array(Buffer.from(b64, 'base64')) };
}

const rows: { photo: string; files: string[][] }[] = [];
for (const file of photos) {
  const name = basename(file, extname(file));
  mkdirSync(join(out, name), { recursive: true });
  const img = await decodeImage(readFileSync(file));
  const W = img.width >= img.height ? LONG : Math.round((LONG * img.width) / img.height);
  const H = img.width >= img.height ? Math.round((LONG * img.height) / img.width) : LONG;
  const src = await prepareSource(1, { name, img, fileSha256: '0'.repeat(64) as any, fileBytes: 0, hadTransparency: false });
  const s = await withSource(createInitialState(Date.UTC(2026, 9, 13, 3), 'Asia/Tokyo'), src);
  const w = s.spaceWorld as SpaceWorld;
  const files: string[][] = [];
  for (const kind of LIGHT_SHAPES) {
    const shape = { ...w.atmosphere.shape, kind };
    const forced: SpaceWorld = { ...w, atmosphere: { ...w.atmosphere, shape, env: { ...w.atmosphere.env, sphere: sphereTiltFor(w.atmosphere.env.sphere, shape) } } };
    const row: string[] = [];
    for (const morph of MORPHS) {
      const { rgba } = renderWorld(forced, img, src.features, { morph }, W, H, 'copies', 0.4);
      const png = new PNG({ width: W, height: H });
      png.data.set(rgba);
      const f = `${name}/${kind}-${morph}.png`;
      writeFileSync(join(out, f), PNG.sync.write(png));
      row.push(f);
    }
    files.push(row);
    console.log(`${name} ${kind}`);
  }
  rows.push({ photo: name, files });
}
await browser.close();

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const body = rows
  .map(
    (r) =>
      `<h2>${esc(r.photo)}</h2><table><tr><th></th>${LIGHT_SHAPES.map((k) => `<th>${NAMES[k]}</th>`).join('')}</tr>` +
      MORPHS.map((m, j) => `<tr><th>変貌 ${m}</th>${r.files.map((f) => `<td><img src="${esc(f[j])}"></td>`).join('')}</tr>`).join('') +
      '</table>',
  )
  .join('');
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>光の形の比較（021）</title><style>
body{font-family:system-ui,sans-serif;background:#1b1b1b;color:#ddd;margin:24px}table{border-collapse:collapse}th,td{padding:4px}th{font-weight:normal;color:#aaa}
img{width:300px;display:block}</style></head><body><h1>光の形の比較（021 FR-2105）</h1><p>物の複製の背景の光を、形ごとに描いたもの。上の段が変貌 0.5、下の段が変貌 1（ラブラドライトの色）。AI なし、作品日時 2026-10-13 12:00。</p>${body}</body></html>\n`,
);
console.log(join(out, 'index.html'));
