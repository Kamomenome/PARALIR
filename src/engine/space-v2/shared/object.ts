import type { ImageFeatures } from '../../common/analysis/features';
import { chooseByOverlap } from '../../common/parts/choice';
import { PART, partAt, type PhotoParts } from '../../common/parts/types';
import { regionMask } from './inplace';
import type { RgbImage } from '../../common/image/normalize';
import { clip, smoothstep } from '../../common/math';
import { blurChannel } from './color';
import { linearSmall, type SmallImage } from './photo';
import type { Mask } from './plates';
import { estimateSubject, type Subject } from './subject';

/**
 * The main object of a photo (research R-304): its subject (found without AI), or — when nothing stands
 * out — the region around the photo's most detailed spot, cut along its colour boundary. It depends on
 * the photo only (not on the seed), so every world of a photo shows the same object.
 */
export interface PhotoObject {
  /** Square crop around the object (normalised photo coordinates; half-size in photo heights). */
  crop: [number, number, number];
  mask: Mask;
  /** The object's box (u0, v0, u1, v1, normalised). */
  box: [number, number, number, number];
  /** True when the photo has a subject (the split world needs one). */
  subject: boolean;
  /** Where the outline comes from: the AI's person, the AI's cut-out object, or the estimate without AI (004 FR-405). */
  source: 'parts' | 'object' | 'estimate';
}

const subjectCache = new WeakMap<RgbImage, Subject | null>();

export function subjectOf(img: RgbImage): Subject | null {
  if (!subjectCache.has(img)) subjectCache.set(img, estimateSubject(img));
  return subjectCache.get(img) ?? null;
}

/** A soft mask over a square crop, from a function of photo (u, v). */
export function cropMask(crop: [number, number, number], aspect: number, f: (u: number, v: number) => number, res = 96): Mask {
  const [cu, cv, half] = crop;
  const a = new Float32Array(res * res);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const su = cu + (((x + 0.5) / res - 0.5) * 2 * half) / aspect;
      const sv = cv + ((y + 0.5) / res - 0.5) * 2 * half;
      a[y * res + x] = f(su, sv);
    }
  }
  return { w: res, h: res, a };
}

/**
 * The object under a crop's centre: region growing on the small photo inside the crop (colour close to
 * the seed pixel and to its neighbour), softened, fading out before the crop's border.
 */
export function cutoutMask(small: SmallImage, crop: [number, number, number], aspect: number): Mask {
  const [cu, cv, half] = crop;
  const w = Math.max(8, Math.round(((2 * half) / aspect) * small.w));
  const h = Math.max(8, Math.round(2 * half * small.h));
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = clip(cu + (((x + 0.5) / w - 0.5) * 2 * half) / aspect, 0, 1) * (small.w - 1);
      const v = clip(cv + ((y + 0.5) / h - 0.5) * 2 * half, 0, 1) * (small.h - 1);
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const x1 = Math.min(small.w - 1, x0 + 1);
      const y1 = Math.min(small.h - 1, y0 + 1);
      const fx = u - x0;
      const fy = v - y0;
      const at = (c: Float32Array) => Math.sqrt((c[y0 * small.w + x0] * (1 - fx) + c[y0 * small.w + x1] * fx) * (1 - fy) + (c[y1 * small.w + x0] * (1 - fx) + c[y1 * small.w + x1] * fx) * fy);
      ch[0][y * w + x] = at(small.r);
      ch[1][y * w + x] = at(small.g);
      ch[2][y * w + x] = at(small.b);
    }
  }
  const dist = (i: number, j: number) => Math.hypot(ch[0][i] - ch[0][j], ch[1][i] - ch[1][j], ch[2][i] - ch[2][j]);
  const grow = (seed: number): Uint8Array => {
    const inside = new Uint8Array(n);
    const stack = [seed];
    inside[seed] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!inside[j] && dist(i, j) < 0.09 && dist(seed, j) < 0.26) {
          inside[j] = 1;
          stack.push(j);
        }
      }
    }
    return inside;
  };
  const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);
  let region = grow(Math.floor(h / 2) * w + Math.floor(w / 2));
  // A centre on a thin line gives a sliver: then take the largest object around it.
  if (count(region) < 0.12 * n) {
    for (const [sx, sy] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
      const r = grow(Math.floor(sy * h) * w + Math.floor(sx * w));
      if (count(r) > count(region)) region = r;
    }
  }
  const a = Float32Array.from(region);
  blurChannel(a, w, h, 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x + 0.5, w - x - 0.5, y + 0.5, h - y - 0.5) / Math.min(w, h);
      a[y * w + x] = smoothstep((a[y * w + x] - 0.3) / 0.4) * smoothstep(edge / 0.06);
    }
  }
  return { w, h, a };
}

const objectCache = new WeakMap<RgbImage, PhotoObject>();
const partsCache = new WeakMap<PhotoParts, WeakMap<RgbImage, PhotoObject | null>>();

/** The object from the AI parts: the person, else the cut-out object; null when the parts have neither. */
function partsObject(img: RgbImage, parts: PhotoParts): PhotoObject | null {
  const m = parts.person ?? parts.object;
  return m ? objectFromMask(img, parts, m, parts.person ? 'parts' : 'object') : null;
}

/** The range from a lasso (005 FR-504) as an object; its outline is used as it is. */
export function rangeObject(img: RgbImage, range: { w: number; h: number; mask: Uint8Array }): PhotoObject | null {
  return objectFromMask(img, range, range.mask, 'parts');
}

/** An object from a mask on the parts' grid (0..255): its box, a square crop and the mask in it. */
function objectFromMask(img: RgbImage, parts: { w: number; h: number }, m: Uint8Array, source: 'parts' | 'object'): PhotoObject | null {
  let u0 = 1;
  let v0 = 1;
  let u1 = 0;
  let v1 = 0;
  for (let y = 0; y < parts.h; y++) {
    for (let x = 0; x < parts.w; x++) {
      if (m[y * parts.w + x] < 128) continue;
      u0 = Math.min(u0, x / parts.w);
      v0 = Math.min(v0, y / parts.h);
      u1 = Math.max(u1, (x + 1) / parts.w);
      v1 = Math.max(v1, (y + 1) / parts.h);
    }
  }
  if (u1 <= u0 || v1 <= v0) return null;
  const aspect = img.width / img.height;
  const half = (Math.max((u1 - u0) * aspect, v1 - v0) * 1.05) / 2;
  const crop: [number, number, number] = [(u0 + u1) / 2, (v0 + v1) / 2, half];
  // The segmenter's confidence is never quite 0 away from the subject: below a quarter it is nothing.
  return { crop, mask: cropMask(crop, aspect, (u, v) => smoothstep((partAt(m, parts, u, v) - 0.25) / 0.5), 192), box: [u0, v0, u1, v1], subject: true, source };
}

/**
 * The range the rectangles rebuild (004 FR-411). The estimate without AI is the aim (it gave the pictures the
 * user liked: a face, a band of a roof, a stage's frame); the AI's candidate that overlaps it most — the person's
 * head (face skin and hair), the whole person, or one of the cut-outs — takes its place with a clean outline.
 * Without parts, or when nothing overlaps enough, the estimate itself.
 */
export function mosaicObject(img: RgbImage, features: ImageFeatures, parts: PhotoParts | null, estimate: PhotoObject = mainObject(img, features)): PhotoObject {
  if (!parts) return estimate;
  const n = parts.w * parts.h;
  const candidates: Uint8Array[] = [];
  if (parts.classes && parts.person) {
    const cls = parts.classes;
    candidates.push(Uint8Array.from(cls, (c) => (c === PART.faceSkin || c === PART.hair ? 255 : 0)));
    candidates.push(parts.person);
  }
  candidates.push(...parts.cuts);
  const aim = regionMask(estimate, img, parts.w, parts.h);
  const bits = (m: ArrayLike<number>, t: number) => Uint8Array.from({ length: n }, (_, i) => (m[i] > t ? 1 : 0));
  const k = chooseByOverlap(bits(aim, 0.5), candidates.map((c) => bits(c, 127)));
  return (k >= 0 && objectFromMask(img, parts, candidates[k], 'parts')) || estimate;
}

/**
 * The main object: from the AI parts when given (the person, else the object cut out at the estimated
 * subject), else the estimate without AI (004 FR-405).
 */
export function mainObject(img: RgbImage, features: ImageFeatures, parts: PhotoParts | null = null): PhotoObject {
  if (parts) {
    let byImg = partsCache.get(parts);
    if (!byImg) partsCache.set(parts, (byImg = new WeakMap()));
    if (!byImg.has(img)) byImg.set(img, partsObject(img, parts));
    const hit = byImg.get(img);
    if (hit) return hit;
  }
  const hit = objectCache.get(img);
  if (hit) return hit;
  const aspect = img.width / img.height;
  const subject = subjectOf(img);
  let obj: PhotoObject;
  if (subject) {
    const [u0, v0, u1, v1] = subject.box;
    const half = (Math.max((u1 - u0) * aspect, v1 - v0) * 1.05) / 2;
    const crop: [number, number, number] = [(u0 + u1) / 2, (v0 + v1) / 2, half];
    obj = { crop, mask: cropMask(crop, aspect, (u, v) => smoothstep((subject.at(u, v) - 0.2) / 0.5)), box: subject.box, subject: true, source: 'estimate' };
  } else {
    // The most detailed spot of the photo (blurred detail map), away from the borders.
    const { analysisWidth: w, analysisHeight: h } = features;
    const g = Float32Array.from(features.maps.G);
    blurChannel(g, w, h, Math.max(1, Math.round(w * 0.04)));
    let best = 0;
    let bv = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        if (u < 0.2 || u > 0.8 || v < 0.2 || v > 0.8) continue;
        if (g[y * w + x] > bv) {
          bv = g[y * w + x];
          best = y * w + x;
        }
      }
    }
    const half = 0.2;
    const crop: [number, number, number] = [clip((best % w + 0.5) / w, half / aspect, 1 - half / aspect), clip((Math.floor(best / w) + 0.5) / h, half, 1 - half), half];
    obj = {
      crop,
      mask: cutoutMask(linearSmall(img), crop, aspect),
      box: [crop[0] - half / aspect, crop[1] - half, crop[0] + half / aspect, crop[1] + half],
      subject: false,
      source: 'estimate',
    };
  }
  objectCache.set(img, obj);
  return obj;
}

/**
 * A "limb" of the object: its outer vertical strip on one side (a fan of limbs grows from it), in a
 * square crop around the strip. Without a part model, the outer strip stands in for an arm.
 */
export function limbOf(obj: PhotoObject, img: RgbImage, side: number, share: number): { crop: [number, number, number]; mask: Mask } {
  const aspect = img.width / img.height;
  const [u0, v0, u1, v1] = obj.box;
  const su0 = side > 0 ? u1 - share * (u1 - u0) : u0;
  const su1 = side > 0 ? u1 : u0 + share * (u1 - u0);
  const crop: [number, number, number] = [(su0 + su1) / 2, (v0 + v1) / 2, ((v1 - v0) * 1.02) / 2];
  // The strip, masked by the object's own outline (sampled through its crop).
  const [ocu, ocv, ohalf] = obj.crop;
  const inObj = (u: number, v: number) => {
    const mu = 0.5 + ((u - ocu) * aspect) / (2 * ohalf);
    const mv = 0.5 + (v - ocv) / (2 * ohalf);
    if (mu < 0 || mu > 1 || mv < 0 || mv > 1) return 0;
    const m = obj.mask;
    return m.a[Math.min(m.h - 1, Math.floor(mv * m.h)) * m.w + Math.min(m.w - 1, Math.floor(mu * m.w))];
  };
  return { crop, mask: cropMask(crop, aspect, (u, v) => (u >= su0 && u <= su1 ? inObj(u, v) : 0)) };
}

