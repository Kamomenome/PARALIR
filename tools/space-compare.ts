/**
 * Renders the spatial mode (space-v2, spec 003) for a photo: the seed's own world for each variation, or
 * every world type for one variation, with settings, versions and render times.
 * Usage: npx tsx tools/space-compare.ts [input.png] [--out out/space] [--width 1200]
 *        [--variations 0-11 | --variation 0 --all-types] [--type portal] [--parts out/parts/x.parts.json] [--lasso out/parts/x.lasso.json] [--time 2026-10-11T12:00] [--tz Asia/Tokyo]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { analyze } from '../src/engine/common/analysis/features';
import { pixelHash } from '../src/engine/common/hash/sha256';
import { lassoRange } from '../src/engine/common/parts/lasso';
import { partsFromJson } from '../src/engine/common/parts/serialize';
import { buildSpaceSeedInput, deriveSpaceSeeds } from '../src/engine/space-v2/seeds';
import { DEFAULT_SPACE_CONTROLS } from '../src/engine/space-v2/types';
import { WORLD_TYPES, composeWorld, renderWorld, type WorldType } from '../src/engine/space-v2/world';
import { snapshotFromLocal } from '../src/engine/common/time/snapshot';
import { readPngRgb } from '../tests/helpers/png';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const input = positional[0] ?? 'tests/fixtures/images/scene.png';
const out = opt('--out', 'out/space');
const W = Number(opt('--width', '1200'));
const H = Math.floor((3 * W) / 4);
const time = snapshotFromLocal(opt('--time', '2026-10-11T12:00'), opt('--tz', 'Asia/Tokyo'));
const range = opt('--variations', opt('--variation', '0'));
const [a, b] = range.includes('-') ? range.split('-').map(Number) : [Number(range), Number(range)];
const allTypes = args.includes('--all-types');
const onlyType = opt('--type', '') as WorldType | '';
const partsFile = opt('--parts', '');
const lassoFile = opt('--lasso', '');

mkdirSync(out, { recursive: true });
const img = readPngRgb(input);
const features = analyze(img);
const hash = await pixelHash(img);
const controls = { ...DEFAULT_SPACE_CONTROLS };
// The AI parts made by tools/parts-extract.ts (004); without them the estimate is used.
const parts = partsFile ? partsFromJson(JSON.parse(readFileSync(partsFile, 'utf8'))) : null;
// A lasso and the AI's cuts at its hints (tools/parts-extract.ts --lassos, 005).
const lassoData = lassoFile ? JSON.parse(readFileSync(lassoFile, 'utf8')) : null;
const themeRange = lassoData ? lassoRange(lassoData.lasso, parts, lassoData.cuts.map((c: string) => Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0))), parts?.w, parts?.h) : null;
if (themeRange) console.log(`lasso range: ${themeRange.source}`);
const records = [];
for (let v = a; v <= b; v++) {
  const seeds = await deriveSpaceSeeds(buildSpaceSeedInput(hash, time, v));
  const world = await composeWorld(seeds, features, controls, img, parts);
  const types: (WorldType | undefined)[] = onlyType ? [onlyType] : allTypes ? [...WORLD_TYPES].filter((t) => t !== 'split' || world.hasSubject) : [undefined];
  for (const type of types) {
    const t0 = performance.now();
    const { rgba } = renderWorld(world, img, features, controls, W, H, type, undefined, parts, themeRange);
    const ms = Math.round(performance.now() - t0);
    const png = new PNG({ width: W, height: H });
    png.data.set(rgba);
    const name = `v${v}-${type ?? world.type}.png`;
    writeFileSync(join(out, name), PNG.sync.write(png));
    records.push({ variation: v, file: name, seedType: world.type, type: type ?? world.type, inner: { copies: world.copies.kind, dark: world.dark.kind, atmosphere: world.atmosphere.kind, shape: world.atmosphere.shape.kind }, renderMs: ms });
    console.log(`${name}: ${ms} ms`);
  }
}
writeFileSync(
  join(out, 'settings.json'),
  JSON.stringify({ input, parts: parts?.digest ?? null, time, width: W, height: H, controls, engine: 'space-v2', records, environment: { node: process.version, cpu: cpus()[0]?.model, threads: 1 } }, null, 2),
);
