// Makes the AI parts of photos with the app's own AI in a headless browser and saves them for the comparison
// sheets (004 T409). Usage: npx tsx tools/parts-extract.ts photo.png [photo2.png ...] --out out/parts [--lassos lassos.json]
// lassos.json: { "<photo name>": [[u, v], ...] } — the AI also cuts at each lasso's hints (005), saved as <name>.lasso.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { analyze } from '../src/engine/common/analysis/features';
import { hintPoints } from '../src/engine/common/parts/choice';
import { lassoHints } from '../src/engine/common/parts/lasso';
import { mainObject } from '../src/engine/space-v2/shared/object';
import { readPngRgb } from '../tests/helpers/png';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : 'out/parts';
const lassoAt = args.indexOf('--lassos');
const lassos: Record<string, [number, number][]> = lassoAt >= 0 ? JSON.parse(readFileSync(args[lassoAt + 1], 'utf8')) : {};
const photos = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1) && (lassoAt < 0 || i !== lassoAt + 1));
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith('http://localhost:5199')) external.push(r.url());
  });
  await page.goto('http://localhost:5199/tools/parts.html');
  await page.waitForFunction(() => (window as any).__ready === true);
  for (const file of photos) {
    const img = readPngRgb(file);
    const hints = hintPoints(mainObject(img, analyze(img)));
    const b64 = Buffer.from(img.data).toString('base64');
    const r = await page.evaluate(([w, h, d, hs]) => (window as any).__parts(w, h, d, hs), [img.width, img.height, b64, hints] as const);
    const name = basename(file, extname(file));
    writeFileSync(join(out, `${name}.parts.json`), JSON.stringify(r.json));
    const kind = r.json.person ? 'person' : r.json.object ? 'object' : 'none';
    console.log(`${name}: ${kind}, faces ${r.json.faces.length}, ${r.ms} ms, digest ${r.json.digest}`);
    const lasso = lassos[name];
    if (lasso) {
      const cuts = await page.evaluate(([w, h, d, hs]) => (window as any).__cuts(w, h, d, hs), [img.width, img.height, b64, lassoHints(lasso)] as const);
      writeFileSync(join(out, `${name}.lasso.json`), JSON.stringify({ lasso, cuts }));
    }
  }
  if (external.length) throw new Error(`external requests: ${external.join(', ')}`);
} finally {
  await browser.close();
  await server.close();
}
