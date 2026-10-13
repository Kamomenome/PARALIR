// Records the SHA-256 of the pixels of the liked 002 Phase 9 cells (out/liked/phase9, git-ignored) into
// tests/fixtures/phase9-hashes.json, so the restored renderer can be checked without the images (005 SC-501).
// Usage: npx tsx tools/phase9-hashes.ts
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const cells = [];
for (const foreground of ['plates', 'cutouts', 'contours', 'kaleidoscope']) {
  for (let variation = 0; variation < 4; variation++) {
    const dir = `out/liked/phase9/${foreground}`;
    const png = PNG.sync.read(readFileSync(`${dir}/v${variation}-composite.png`));
    const settings = JSON.parse(readFileSync(`${dir}/v${variation}-settings.json`, 'utf8'));
    cells.push({
      foreground,
      variation,
      width: png.width,
      height: png.height,
      quality: settings.quality,
      pipeline: settings.pipeline,
      rootSeed: settings.rootSeed,
      rgbaSha256: createHash('sha256').update(png.data).digest('hex'),
    });
  }
}
mkdirSync('tests/fixtures', { recursive: true });
writeFileSync('tests/fixtures/phase9-hashes.json', JSON.stringify({ input: 'samples/reference/decoded-source.png', time: '2026-10-11T12:00 Asia/Tokyo', cells }, null, 2) + '\n');
console.log(`${cells.length} cells`);
