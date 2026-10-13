import type { RgbImage } from '../../../../common/image/normalize';
import { smoothstep } from '../../../../common/math';
import { classAt, eyeBoxes, faceBox, PART, type PhotoParts } from '../../../../common/parts/types';
import { framePhoto, maskAt, regionBox, regionMask, rng, toRgba } from '../../shared/inplace';
import { cropMask, type PhotoObject } from '../../shared/object';
import type { Mask } from '../../shared/plates';
import { mipSampler } from '../../shared/photo';
import { drawsFrom } from '../../draws';
import type { SpaceControls } from '../../types';

/**
 * World ⑦ The subject filled with itself (003 FR-318; reference: a figure whose outline is filled with rows
 * and spirals of smaller copies of the same figure). The photo stays as it is; inside the subject's outline
 * copies of the subject (cut out by its outline) are laid in rows (the same size, stepped and overlapping)
 * and in spirals (each copy smaller by a constant ratio and turned by a constant angle, sinking towards a
 * point inside the outline). Nothing is drawn outside the outline, so the outline still reads.
 */
export interface EchoParams {
  rows: number;
  spirals: number;
  /** Row copies: half-size as a share of the subject's box height; overlap step as a share of the size. */
  rowSize: number;
  rowStep: number;
  /** Spiral: size ratio per copy and the turn per copy (radians). */
  ratio: number;
  turn: number;
  seed: number;
}

export async function buildEcho(stream: Uint8Array): Promise<EchoParams> {
  const d = await drawsFrom(stream, 'echo/main', 8);
  return {
    rows: 2 + Math.floor(2.99 * d[0]),
    spirals: 1 + Math.floor(1.99 * d[1]),
    rowSize: 0.1 + 0.16 * d[2],
    rowStep: 0.35 + 0.4 * d[3],
    ratio: 0.78 + 0.1 * d[4],
    turn: (0.2 + 0.4 * d[5]) * (d[6] < 0.5 ? -1 : 1),
    seed: Math.floor(d[7] * 2 ** 31),
  };
}

export interface EchoCopy {
  strand: number;
  kind: 'row' | 'spiral';
  /** Index along its strand. */
  k: number;
  /** Centre and half-size (frame pixels), turn of the copy (radians). */
  cx: number;
  cy: number;
  size: number;
  angle: number;
  /** Which sprite it copies (echoLayout().sprites). */
  sprite: number;
}

/** What a copy shows: the whole subject, or (with the AI parts) its face or an eye (004 FR-406). */
export interface EchoSprite {
  source: 'whole' | 'face' | 'eye';
  crop: [number, number, number];
  mask: Mask;
}

/** The sprites: the whole subject; with a face found by the AI, the face and both eyes. */
function echoSprites(obj: PhotoObject, img: RgbImage, parts: PhotoParts | null): EchoSprite[] {
  const sprites: EchoSprite[] = [{ source: 'whole', crop: obj.crop, mask: obj.mask }];
  const face = parts?.faces[0];
  if (!parts || !face) return sprites;
  const aspect = img.width / img.height;
  const [u0, v0, u1, v1] = faceBox(face);
  const fc: [number, number, number] = [(u0 + u1) / 2, (v0 + v1) / 2, (Math.max((u1 - u0) * aspect, v1 - v0) * 1.15) / 2];
  // The face cut along the face skin and hair (an oval where the AI gave no classes).
  const faceMask = cropMask(fc, aspect, (u, v) => {
    if (parts.classes) {
      const c = classAt(parts, u, v);
      return c === PART.faceSkin || c === PART.hair ? 1 : 0;
    }
    const lx = ((u - fc[0]) * aspect) / fc[2];
    const ly = (v - fc[1]) / fc[2];
    return smoothstep((0.85 - Math.hypot(lx, ly)) / 0.1);
  });
  sprites.push({ source: 'face', crop: fc, mask: faceMask });
  // The eyes as strips (a soft-edged band across the eye, wider than tall).
  for (const [a0, b0, a1, b1] of eyeBoxes(face)) {
    const ec: [number, number, number] = [(a0 + a1) / 2, (b0 + b1) / 2, ((a1 - a0) * aspect * 1.6) / 2];
    const strip = cropMask(ec, aspect, (u, v) => {
      const lx = ((u - ec[0]) * aspect) / ec[2];
      const ly = (v - ec[1]) / ec[2];
      return smoothstep((1 - Math.abs(lx)) / 0.15) * smoothstep((0.5 - Math.abs(ly)) / 0.12);
    });
    sprites.push({ source: 'eye', crop: ec, mask: strip });
  }
  return sprites;
}

export function echoLayout(
  p: EchoParams,
  obj: PhotoObject,
  img: RgbImage,
  W: number,
  H: number,
  sizeK = 1,
  parts: PhotoParts | null = null,
): { copies: EchoCopy[]; region: Float32Array; sprites: EchoSprite[] } {
  const region = regionMask(obj, img, W, H);
  const box = regionBox(region, W, H) ?? [W * 0.3, H * 0.3, W * 0.7, H * 0.7];
  const bh = Math.max(box[3] - box[1], box[2] - box[0]);
  const sprites = echoSprites(obj, img, parts);
  const pxPerPhoto = Math.max(H, (W * img.height) / img.width);
  const rand = rng(p.seed);
  const at = (x: number, y: number) => {
    const X = Math.round(x);
    const Y = Math.round(y);
    return X < 0 || Y < 0 || X >= W || Y >= H ? 0 : region[Y * W + X];
  };
  const inside = (t: number) => {
    for (let k = 0; k < 60; k++) {
      const x = box[0] + rand() * (box[2] - box[0]);
      const y = box[1] + rand() * (box[3] - box[1]);
      if (at(x, y) > t) return [x, y];
    }
    return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  };
  const copies: EchoCopy[] = [];
  let strand = 0;
  /** A row: copies of one sprite, the same size, stepped along a line out from a start point both ways. */
  const row = (sprite = 0, size = p.rowSize * bh * sizeK, step = p.rowStep * 2 * size, dir = rand() * Math.PI, min = 1) => {
    const [px, py] = inside(0.5);
    const tilt = sprite === 0 ? (rand() - 0.5) * 0.3 : 0;
    const run: EchoCopy[] = [];
    for (const side of [-1, 1]) {
      for (let j = side < 0 ? 1 : 0; j < 14; j++) {
        const cx = px + side * j * step * Math.cos(dir);
        const cy = py + side * j * step * Math.sin(dir);
        if (at(cx, cy) <= 0.3) break;
        run.push({ strand, kind: 'row', k: side * j, cx, cy, size, angle: tilt, sprite });
      }
    }
    if (run.length < min) return false;
    copies.push(...run);
    strand++;
    return true;
  };
  const spiral = () => {
    const [qx, qy] = inside(0.7);
    const s0 = (0.24 + 0.12 * rand()) * bh * sizeK;
    const r0 = 1.2 * s0;
    const a0 = rand() * 2 * Math.PI;
    const all: EchoCopy[] = [];
    for (let k = 0; k < 24; k++) {
      const q = p.ratio ** k;
      if (s0 * q < 2) break;
      const a = a0 + k * p.turn;
      all.push({ strand, kind: 'spiral', k, cx: qx + r0 * q * Math.cos(a), cy: qy + r0 * q * Math.sin(a), size: s0 * q, angle: k * p.turn, sprite: 0 });
    }
    // From the innermost copy outwards, as long as the centres stay inside (one unbroken run).
    let first = all.length;
    while (first > 0 && at(all[first - 1].cx, all[first - 1].cy) > 0.3) first--;
    copies.push(...all.slice(first));
    strand++;
  };
  for (let k = 0; k < p.rows; k++) row();
  for (let k = 0; k < p.spirals; k++) spiral();
  // Fill the outline: more rows until about four fifths of it lies under a copy.
  const covered = () => {
    let n = 0;
    let hit = 0;
    for (let y = box[1]; y < box[3]; y += 4) {
      for (let x = box[0]; x < box[2]; x += 4) {
        if (at(x, y) <= 0.5) continue;
        n++;
        if (copies.some((e) => Math.hypot(x - e.cx, y - e.cy) < 0.7 * e.size)) hit++;
      }
    }
    return n === 0 ? 1 : hit / n;
  };
  for (let k = 0; k < 10 && covered() < 0.8; k++) row();
  // Enough copies (more rows if a small outline cut them short).
  for (let k = 0; k < 12 && (copies.length < 12 || !copies.some((c) => c.kind === 'spiral') || !copies.some((c) => c.kind === 'row')); k++) {
    if (!copies.some((c) => c.kind === 'spiral')) spiral();
    else row();
  }
  // With a face: rows of faces (heads stepping) and columns of eyes, laid over the rest.
  const faceIdx = sprites.findIndex((s) => s.source === 'face');
  if (faceIdx > 0) {
    const fs = sprites[faceIdx].crop[2] * pxPerPhoto * sizeK;
    for (let tries = 0, made = 0; tries < 12 && made < 1 + (p.rows > 2 ? 1 : 0); tries++) {
      const size = fs * (0.7 + 0.4 * rand());
      if (row(faceIdx, size, size * (0.8 + 0.5 * rand()), rand() * Math.PI, 2)) made++;
    }
    const eyes = sprites.map((s, i) => (s.source === 'eye' ? i : -1)).filter((i) => i >= 0);
    for (let tries = 0, made = 0; tries < 12 && made < 1 + (p.spirals > 1 ? 1 : 0); tries++) {
      const e = eyes[made % eyes.length];
      const size = sprites[e].crop[2] * pxPerPhoto * sizeK * (1 + 0.6 * rand());
      if (row(e, size, size * 1.05, Math.PI / 2 + (rand() - 0.5) * 0.6, 2)) made++;
    }
  }
  return { copies, region, sprites };
}

export function renderEcho(p: EchoParams, obj: PhotoObject, img: RgbImage, c: SpaceControls, W: number, H: number, parts: PhotoParts | null = null): { rgba: Uint8ClampedArray; objects: Float32Array } {
  const { copies, region, sprites } = echoLayout(p, obj, img, W, H, 0.75 + 0.5 * c.size, parts);
  const out = framePhoto(img, W, H);
  const objects = new Float32Array(W * H);
  const aspect = img.width / img.height;
  const sample = mipSampler(img);
  // The whole subject's rows, its spirals (largest copy first, the smallest on top), then faces and eyes.
  const layer = (e: EchoCopy) => {
    const src = sprites[e.sprite].source;
    return src === 'whole' ? (e.kind === 'row' ? 0 : 1) : src === 'face' ? 2 : 3;
  };
  const order = [...copies].sort((a, b) => layer(a) - layer(b) || a.strand - b.strand || a.k - b.k);
  const col = [0, 0, 0];
  const clipTo = region.map((v) => smoothstep((v - 0.02) / 0.3));
  for (const e of order) {
    const sp = sprites[e.sprite];
    const [cu, cv, half] = sp.crop;
    const cos = Math.cos(e.angle);
    const sin = Math.sin(e.angle);
    const alphaAt = (x: number, y: number) => {
      const lx = ((x - e.cx) * cos + (y - e.cy) * sin) / e.size;
      const ly = (-(x - e.cx) * sin + (y - e.cy) * cos) / e.size;
      if (Math.abs(lx) > 1 || Math.abs(ly) > 1) return [0, 0, 0];
      const u = cu + (lx * half) / aspect;
      const v = cv + ly * half;
      return [maskAt(sp, aspect, u, v), u, v];
    };
    const R = Math.ceil(e.size * 1.42) + 2;
    const sh = Math.max(1, 0.08 * e.size);
    const foot = (2 * half * img.height) / (2 * e.size);
    for (let y = Math.max(0, Math.floor(e.cy - R)); y < Math.min(H, Math.ceil(e.cy + R)); y++) {
      for (let x = Math.max(0, Math.floor(e.cx - R)); x < Math.min(W, Math.ceil(e.cx + R)); x++) {
        const i = y * W + x;
        const k = clipTo[i];
        if (k <= 0) continue;
        // A soft shadow under the copy (it lies on what is beneath), then the copy.
        const [sa] = alphaAt(x - sh, y - sh);
        const [a, u, v] = alphaAt(x + 0.5, y + 0.5);
        const shade = 1 - 0.35 * sa * k * (1 - a);
        out.r[i] *= shade;
        out.g[i] *= shade;
        out.b[i] *= shade;
        const ak = a * k;
        if (ak <= 0) continue;
        sample(u, v, foot, col);
        out.r[i] = out.r[i] * (1 - ak) + col[0] * ak;
        out.g[i] = out.g[i] * (1 - ak) + col[1] * ak;
        out.b[i] = out.b[i] * (1 - ak) + col[2] * ak;
        objects[i] = Math.max(objects[i], ak);
      }
    }
  }
  return { rgba: toRgba(out, W, H), objects };
}
