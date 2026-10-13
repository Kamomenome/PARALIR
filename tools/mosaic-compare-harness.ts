// Dev-only page for tools/mosaic-compare.ts (015 FR-1501): the rectangles world of a photo with the hole filled
// six ways, side by side. Nothing leaves the device; the app itself is not changed by this.
import { blockExternalRequests } from '../src/app/offline';
import { decodeFile } from '../src/app/decode';
import { createInitialState, prepareSource, setSpaceControls, withSource } from '../src/app/state';
import { linearToSrgb, newRgb, type Rgb3 } from '../src/engine/space-v2/shared/color';
import { blurChannel } from '../src/engine/space-v2/shared/hdr';
import { cleanPlate, framePhoto, grow, rng } from '../src/engine/space-v2/shared/inplace';
import { mosaicObject } from '../src/engine/space-v2/shared/object';
import type { SpaceWorld } from '../src/engine/space-v2/world';
import { mosaicLayout, renderMosaic } from '../src/engine/space-v2/worlds/mosaic/mosaic';

blockExternalRequests();

const W = 960;
const H = 720;
const copy = (c: Rgb3): Rgb3 => ({ r: Float32Array.from(c.r), g: Float32Array.from(c.g), b: Float32Array.from(c.b) });

/** The hole cleanPlate fills: the region taken away, grown a little (as in shared/inplace.ts). */
function holeOf(region: Float32Array, cut: number): Float32Array {
  return grow(region.map((v) => (v > cut ? 1 : 0)), W, H, Math.max(1, Math.round(0.015 * H)));
}

const share = (m: Float32Array, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += m[y * W + x] > 0.5 ? 1 : 0;
  return n / Math.max(1, (x1 - x0) * (y1 - y0));
};

/** A rectangle of the photo moved onto (x0, y0): from the nearest place clear of `avoid`, with the thin cut line. */
function pasteFrom(dst: Rgb3, photo: Rgb3, avoid: Float32Array, x0: number, y0: number, w: number, h: number, rand: () => number, ok = (_sx: number, _sy: number) => true): boolean {
  for (let ring = 1; ring <= 12; ring++) {
    for (let k = 0; k < 8; k++) {
      const a = rand() * 2 * Math.PI;
      const sx = Math.round(x0 + Math.cos(a) * ring * w * 0.8);
      const sy = Math.round(y0 + Math.sin(a) * ring * h * 0.8);
      if (sx < 0 || sy < 0 || sx + w > W || sy + h > H) continue;
      if (share(avoid, sx, sy, sx + w, sy + h) > 0.05 || !ok(sx, sy)) continue;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const tx = x0 + x;
          const ty = y0 + y;
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
          const i = ty * W + tx;
          const j = (sy + y) * W + (sx + x);
          const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 0.75 : 1;
          dst.r[i] = photo.r[j] * edge;
          dst.g[i] = photo.g[j] * edge;
          dst.b[i] = photo.b[j] * edge;
        }
      }
      return true;
    }
  }
  return false;
}

/** B: the hole filled with rectangles of the surrounding photo (crisp, like the rectangles themselves). */
function rectFill(photo: Rgb3, hole: Float32Array, base: Rgb3, seed: number): Rgb3 {
  const out = copy(base);
  const rand = rng(seed);
  const cells: [number, number, number, number][] = [];
  for (let y = 0; y < H; ) {
    const h = Math.round(H * (0.04 + 0.07 * rand()));
    for (let x = 0; x < W; ) {
      const w = Math.round(W * (0.04 + 0.07 * rand()));
      if (share(hole, x, y, Math.min(W, x + w), Math.min(H, y + h)) > 0.02) cells.push([x, y, w, h]);
      x += w;
    }
    y += h;
  }
  for (const [x, y, w, h] of cells.sort(() => rand() - 0.5)) pasteFrom(out, photo, hole, x, y, w, h, rand);
  return out;
}

/** C: the smooth fill with the photo's fine texture added (taken from beside the hole). */
function detailFill(photo: Rgb3, hole: Float32Array, base: Rgb3): Rgb3 {
  const out = copy(base);
  const soft = copy(photo);
  const r = Math.max(1, Math.round(0.006 * H));
  for (const ch of [soft.r, soft.g, soft.b]) blurChannel(ch, W, H, r);
  const shift = Math.round(0.12 * W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (hole[i] < 0.5) continue;
      // The nearest column outside the hole, to the left or the right.
      let sx = x;
      for (let d = shift; d < W; d += shift) {
        if (x - d >= 0 && hole[y * W + x - d] < 0.5) { sx = x - d; break; }
        if (x + d < W && hole[y * W + x + d] < 0.5) { sx = x + d; break; }
      }
      const j = y * W + sx;
      out.r[i] = Math.max(0, out.r[i] + (photo.r[j] - soft.r[j]));
      out.g[i] = Math.max(0, out.g[i] + (photo.g[j] - soft.g[j]));
      out.b[i] = Math.max(0, out.b[i] + (photo.b[j] - soft.b[j]));
    }
  }
  return out;
}

/** How much fine detail each pixel has (local contrast of the luminance). */
function detailMap(c: Rgb3): Float32Array {
  const y = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) y[i] = 0.2126 * c.r[i] + 0.7152 * c.g[i] + 0.0722 * c.b[i];
  const lap = new Float32Array(W * H);
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i;
    lap[k] = Math.abs(4 * y[k] - y[k - 1] - y[k + 1] - y[k - W] - y[k + W]);
  }
  blurChannel(lap, W, H, Math.max(1, Math.round(0.01 * H)));
  return lap;
}

/** D: what came out blurred is found and covered with a collage of the photo; `everywhere` also takes the photo's own soft parts. */
function collageOverBlur(drawn: Rgb3, photo: Rgb3, hole: Float32Array, seed: number, everywhere: boolean): Rgb3 {
  const out = copy(drawn);
  const d = detailMap(drawn);
  const p = detailMap(photo);
  const sorted = Float32Array.from(p).sort();
  const typical = sorted[Math.floor(sorted.length * 0.5)];
  const blurred = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) blurred[i] = (everywhere || hole[i] > 0.5) && d[i] < 0.35 * typical ? 1 : 0;
  const rand = rng(seed ^ 0x9e3779b9);
  const detailOk = (sx: number, sy: number) => share(blurred, sx, sy, sx + 8, sy + 8) < 0.5 && p[sy * W + sx] >= 0.5 * typical;
  const cells: [number, number, number, number][] = [];
  for (let y = 0; y < H; ) {
    const h = Math.round(H * (0.035 + 0.06 * rand()));
    for (let x = 0; x < W; ) {
      const w = Math.round(W * (0.035 + 0.06 * rand()));
      if (share(blurred, x, y, Math.min(W, x + w), Math.min(H, y + h)) > 0.35) cells.push([x, y, w, h]);
      x += w;
    }
    y += h;
  }
  for (const [x, y, w, h] of cells.sort(() => rand() - 0.5)) pasteFrom(out, photo, blurred, x, y, w, h, rand, detailOk);
  return out;
}

const toBytes = (c: Rgb3) => {
  const o = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    o[4 * i] = Math.round(255 * linearToSrgb(c.r[i]));
    o[4 * i + 1] = Math.round(255 * linearToSrgb(c.g[i]));
    o[4 * i + 2] = Math.round(255 * linearToSrgb(c.b[i]));
    o[4 * i + 3] = 255;
  }
  return o;
};
const fromBytes = (rgba: Uint8ClampedArray): Rgb3 => {
  const c = newRgb(W * H);
  for (let i = 0; i < W * H; i++) {
    c.r[i] = Math.pow(rgba[4 * i] / 255, 2.2);
    c.g[i] = Math.pow(rgba[4 * i + 1] / 255, 2.2);
    c.b[i] = Math.pow(rgba[4 * i + 2] / 255, 2.2);
  }
  return c;
};

const LABELS = ['今のアプリの絵', 'A 穴を作らない', 'B 穴を長方形で埋める', 'C 塗りに模様を足す', 'D1 ぼけた所にコラージュ（穴だけ）', 'D2 ぼけた所にコラージュ（元のボケも）'];

/** One photo: a sheet with a row per count (ふつう 0.5, 多い 1.0), six ways per row. */
(window as any).__sheet = async (name: string, b64: string) => {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const loaded = await decodeFile(new File([bytes], name));
  const src = await prepareSource(1, loaded);
  const s0 = await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src);
  const PW = 640;
  const PH = 480;
  const sheet = new OffscreenCanvas(PW * LABELS.length, (PH + 36) * 2);
  const g = sheet.getContext('2d')!;
  g.fillStyle = '#1f1f1f';
  g.fillRect(0, 0, sheet.width, sheet.height);
  for (const [row, count] of [0.5, 1.0].entries()) {
    const s = await setSpaceControls(s0, { count });
    const world = s.spaceWorld as SpaceWorld;
    const obj = mosaicObject(src.loaded.img, src.features, null);
    const { region } = mosaicLayout(world.mosaic, obj, src.loaded.img, W, H, count);
    const cut = obj.source === 'estimate' ? 0.05 : 0.25;
    const hole = holeOf(region, cut);
    const photo = framePhoto(src.loaded.img, W, H);
    const plate = cleanPlate(framePhoto(src.loaded.img, W, H), region, W, H, cut);
    const draw = (base: Rgb3 | null) => renderMosaic(world.mosaic, obj, src.loaded.img, s.spaceControls, W, H, base).rgba;
    const now = draw(null);
    const ways = [
      now,
      draw(photo),
      draw(rectFill(photo, hole, plate, world.mosaic.seed)),
      draw(detailFill(photo, hole, plate)),
      toBytes(collageOverBlur(fromBytes(now), photo, hole, world.mosaic.seed, false)),
      toBytes(collageOverBlur(fromBytes(now), photo, hole, world.mosaic.seed, true)),
    ];
    for (const [k, rgba] of ways.entries()) {
      const c = new OffscreenCanvas(W, H);
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), W, H), 0, 0);
      const y = row * (PH + 36);
      g.drawImage(c, k * PW, y + 36, PW, PH);
      g.fillStyle = '#e8e8e8';
      g.font = '18px "Yu Gothic UI", sans-serif';
      g.fillText(`${LABELS[k]}　長方形の数 ${count === 0.5 ? 'ふつう' : '多い'}`, k * PW + 8, y + 24);
    }
  }
  const blob = await sheet.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};
(window as any).__ready = true;
