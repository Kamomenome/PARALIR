import type { Rgb3 } from '../../shared/color';
import type { RgbImage } from '../../../common/image/normalize';
import { clip } from '../../../common/math';
import { cleanPlate, frameOf, framePhoto, regionBox, regionMask, rng, toRgba } from '../../shared/inplace';
import { fillHole, holeOf } from './fill';
import type { PhotoObject } from '../../shared/object';
import { mipSampler } from '../../shared/photo';
import { drawsFrom } from '../../draws';
import { chaosOf, type SpaceControls } from '../../types';

/**
 * World ⑥ The subject rebuilt from rectangles (003 FR-317; reference: a figure whose body is re-cut into
 * rectangles of itself). The photo stays as it is; only inside the subject's outline, its box is cut
 * (recursively, straight and axis-parallel) into large and small rectangles. Each rectangle shows the
 * subject's own pixels: most shifted a little, some swapped with another rectangle, some a magnified
 * detail. Rectangles may step over the outline; a few are left out and the photo without the subject
 * (filled from around it) shows through.
 */
export interface MosaicParams {
  /** Deepest cut and the chance a rectangle stops being cut early (large ones). */
  depth: number;
  stop: number;
  /** How far a shifted rectangle's pixels move (share of its size); how far it moves itself. */
  shift: number;
  jitter: number;
  /** Shares of swapped, magnified and left-out rectangles. */
  swap: number;
  zoom: number;
  drop: number;
  seed: number;
}

export async function buildMosaic(stream: Uint8Array): Promise<MosaicParams> {
  const d = await drawsFrom(stream, 'mosaic/main', 8);
  return {
    depth: 7 + Math.floor(3 * d[0]),
    stop: 0.1 + 0.15 * d[1],
    shift: 0.2 + 0.5 * d[2],
    jitter: 0.04 + 0.12 * d[6],
    swap: 0.12 + 0.18 * d[3],
    zoom: 0.05 + 0.08 * d[4],
    drop: 0.03 + 0.07 * d[5],
    seed: Math.floor(d[7] * 2 ** 31),
  };
}

export type TileKind = 'keep' | 'shift' | 'swap' | 'zoom';

export interface Tile {
  /** Where it is drawn and where its pixels come from (frame pixels; the source in the photo as it fills the frame). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sx0: number;
  sy0: number;
  sx1: number;
  sy1: number;
  kind: TileKind;
  drop: boolean;
}

/** The box cut recursively into axis-parallel rectangles (frame pixels). */
function cutBox(box: number[], pad: number, maxDepth: number, stop: number, minSide: number, rand: () => number): [number, number, number, number][] {
  const leaves: [number, number, number, number][] = [];
  const cut = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const w = x1 - x0;
    const h = y1 - y0;
    if (depth >= maxDepth || (depth >= 2 && rand() < stop) || Math.max(w, h) < 2 * minSide) {
      leaves.push([x0, y0, x1, y1]);
      return;
    }
    const at = 0.3 + 0.4 * rand();
    const vertical = w > h ? rand() < 0.8 : rand() < 0.2;
    if (vertical) {
      const xm = x0 + w * at;
      cut(x0, y0, xm, y1, depth + 1);
      cut(xm, y0, x1, y1, depth + 1);
    } else {
      const ym = y0 + h * at;
      cut(x0, y0, x1, ym, depth + 1);
      cut(x0, ym, x1, y1, depth + 1);
    }
  };
  cut(box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad, 0);
  return leaves;
}

export function mosaicLayout(p: MosaicParams, obj: PhotoObject, img: RgbImage, W: number, H: number, count = 0.5): { tiles: Tile[]; region: Float32Array } {
  const region = regionMask(obj, img, W, H);
  const box = regionBox(region, W, H) ?? [W * 0.3, H * 0.3, W * 0.7, H * 0.7];
  const pad = 0.04 * H;
  // 長方形の数 (019 FR-1916): from few large rectangles (0) to many small ones (1); at 0.5 as in 003.
  const more = 2 * (count - 0.5);
  const minSide = Math.max(2, 0.022 * H * 2 ** -more);
  const fewest = Math.round(36 * 4 ** more);
  const stop = Math.min(0.9, p.stop * 3 ** -more);
  const at = (x: number, y: number) => region[clip(Math.floor(y), 0, H - 1) * W + clip(Math.floor(x), 0, W - 1)];
  // A small subject is cut deeper, so it always has enough rectangles.
  let rand = rng(p.seed);
  let kept: [number, number, number, number][] = [];
  for (let extra = 0; extra < 5 && kept.length < fewest; extra++) {
    rand = rng(p.seed);
    kept = cutBox(box, pad, p.depth + Math.round(2 * more) + extra, stop / (1 + extra), minSide, rand).filter(([x0, y0, x1, y1]) => {
      let s = 0;
      for (let k = 0; k < 9; k++) s += at(x0 + (x1 - x0) * ((k % 3) + 0.5) / 3, y0 + (y1 - y0) * (Math.floor(k / 3) + 0.5) / 3);
      return s / 9 >= 0.3;
    });
  }
  const inside = () => {
    for (let k = 0; k < 40; k++) {
      const x = box[0] + rand() * (box[2] - box[0]);
      const y = box[1] + rand() * (box[3] - box[1]);
      if (at(x, y) > 0.5) return [x, y];
    }
    return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  };
  const tiles: Tile[] = kept.map(([x0, y0, x1, y1]) => {
    const r = rand();
    const kind: TileKind = r < p.zoom ? 'zoom' : r < p.zoom + p.swap ? 'swap' : r < p.zoom + p.swap + 0.15 ? 'keep' : 'shift';
    return { x0, y0, x1, y1, sx0: x0, sy0: y0, sx1: x1, sy1: y1, kind, drop: rand() < p.drop };
  });
  // At least one swapped and one magnified rectangle.
  for (const kind of ['swap', 'zoom'] as const) {
    if (tiles.length > 2 && !tiles.some((t) => t.kind === kind && !t.drop)) {
      const t = tiles[Math.floor(rand() * tiles.length)];
      t.kind = kind;
      t.drop = false;
    }
  }
  const others = tiles.map((t) => [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2]);
  for (const t of tiles) {
    const w = t.x1 - t.x0;
    const h = t.y1 - t.y0;
    if (t.kind === 'shift') {
      const dx = (rand() - 0.5) * 2 * p.shift * w;
      const dy = (rand() - 0.5) * 2 * p.shift * h;
      t.sx0 += dx;
      t.sx1 += dx;
      t.sy0 += dy;
      t.sy1 += dy;
    } else if (t.kind === 'swap') {
      const [cx, cy] = others[Math.floor(rand() * others.length)];
      [t.sx0, t.sy0, t.sx1, t.sy1] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    } else if (t.kind === 'zoom') {
      const k = 0.25 + 0.3 * rand();
      const [cx, cy] = inside();
      [t.sx0, t.sy0, t.sx1, t.sy1] = [cx - (k * w) / 2, cy - (k * h) / 2, cx + (k * w) / 2, cy + (k * h) / 2];
    }
    if (t.kind !== 'keep') {
      // The rectangle itself steps a little out of place (over the outline, over its neighbours).
      const jx = (rand() - 0.5) * 2 * p.jitter * w;
      const jy = (rand() - 0.5) * 2 * p.jitter * h;
      t.x0 += jx;
      t.x1 += jx;
      t.y0 += jy;
      t.y1 += jy;
    }
  }
  return { tiles, region };
}

/**
 * The rectangles wilder for 変貌 beyond 0.5 (021 FR-2103): shifted, swapped, magnified and left out more, and the
 * rectangles themselves thrown further out of place; 0 as drawn.
 */
export function wilderMosaic(p: MosaicParams, chaos: number): MosaicParams {
  if (chaos <= 0) return p;
  return {
    ...p,
    shift: p.shift * (1 + 5 * chaos),
    jitter: p.jitter * (1 + 8 * chaos),
    swap: Math.min(0.6, p.swap * (1 + 2 * chaos)),
    zoom: Math.min(0.3, p.zoom * (1 + 3 * chaos)),
    drop: Math.min(0.3, p.drop * (1 + chaos)),
  };
}

export function renderMosaic(
  p: MosaicParams,
  obj: PhotoObject,
  img: RgbImage,
  c: SpaceControls,
  W: number,
  H: number,
  base: Rgb3 | null = null,
): { rgba: Uint8ClampedArray; objects: Float32Array } {
  // 変貌 beyond 0.5 (021 FR-2103): as many rectangles, wilder ones.
  const { tiles, region } = mosaicLayout(wilderMosaic(p, chaosOf(c)), obj, img, W, H);
  // The ground: the photo without the subject, its hole filled with rectangles of the photo (015 FR-1504);
  // in the theme world (005), the Phase 9 picture.
  const cut = obj.source === 'estimate' ? 0.05 : 0.25;
  const photo = framePhoto(img, W, H);
  const out = base ?? fillHole(photo, holeOf(region, W, H, cut), cleanPlate(framePhoto(img, W, H), region, W, H, cut), p.seed, W, H).out;
  const objects = new Float32Array(W * H);
  const f = frameOf(img, W, H);
  const sample = mipSampler(img);
  const rand = rng(p.seed ^ 0x5bd1e995);
  // Large ones first, small ones over them (with some disorder).
  const order = tiles
    .filter((t) => !t.drop)
    .map((t) => ({ t, key: (t.x1 - t.x0) * (t.y1 - t.y0) * (0.5 + rand()) }))
    .sort((a, b) => b.key - a.key);
  const col = [0, 0, 0];
  for (const { t } of order) {
    const X0 = Math.max(0, Math.round(t.x0));
    const Y0 = Math.max(0, Math.round(t.y0));
    const X1 = Math.min(W, Math.round(t.x1));
    const Y1 = Math.min(H, Math.round(t.y1));
    const kx = (t.sx1 - t.sx0) / (t.x1 - t.x0);
    const ky = (t.sy1 - t.sy0) / (t.y1 - t.y0);
    for (let y = Y0; y < Y1; y++) {
      for (let x = X0; x < X1; x++) {
        const sx = t.sx0 + (x + 0.5 - t.x0) * kx;
        const sy = t.sy0 + (y + 0.5 - t.y0) * ky;
        sample(f.u0 + sx * f.du, f.v0 + sy * f.dv, f.foot * Math.max(kx, ky), col);
        // A thin darker line at the cut (the edge of a cut piece of photo).
        const edge = x === X0 || y === Y0 || x === X1 - 1 || y === Y1 - 1 ? 0.75 : 1;
        const i = y * W + x;
        out.r[i] = col[0] * edge;
        out.g[i] = col[1] * edge;
        out.b[i] = col[2] * edge;
        objects[i] = 1;
      }
    }
  }
  return { rgba: toRgba(out, W, H), objects };
}
