import { concatBytes, sha256, toHex } from '../hash/sha256';
import { clip } from '../math';

/**
 * The parts of a photo as the on-device AI sees them (004 FR-401): what is where, never how it looks.
 * Masks cover the whole photo (normalised u, v) at w × h, rounded to 8 bits; landmarks are rounded to
 * 1/4096 (research R-403). The generation stays math (FR-403): it only asks where things are.
 */
export const PARTS_VERSION = 'parts-v2';

/** The person classes of the segmenter (selfie multiclass). */
export const PART = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, others: 5 } as const;

/** Face-mesh landmark ids of the two eye contours. */
export const EYE_A = [33, 133, 159, 145, 153, 158, 160, 144] as const;
export const EYE_B = [362, 263, 386, 374, 380, 385, 387, 373] as const;

export interface PhotoParts {
  version: typeof PARTS_VERSION;
  w: number;
  h: number;
  /** Class per pixel (PART); null when no person was found. */
  classes: Uint8Array | null;
  /** How much a pixel is the person (0..255); null when no person was found. */
  person: Uint8Array | null;
  /** The object cut out at the estimated subject (0..255), when there is no person; else null. */
  object: Uint8Array | null;
  /** Every cut-out the AI made (one per hint, 0..255); `object` is the one chosen (004 FR-411). */
  cuts: Uint8Array[];
  /** Landmarks per face: x, y pairs in normalised photo coordinates. */
  faces: Float32Array[];
  /** First 16 hex digits of the SHA-256 of all of the above. */
  digest: string;
}

/** What the AI gives before rounding. */
export interface RawParts {
  w: number;
  h: number;
  classes: Uint8Array | null;
  /** Confidence of the background class (0..1). */
  background: Float32Array | null;
  object: Float32Array | null;
  cuts: Float32Array[];
  faces: ArrayLike<number>[];
}

const toByte = (m: Float32Array) => Uint8Array.from(m, (v) => Math.round(255 * clip(v, 0, 1)));

export async function buildParts(raw: RawParts): Promise<PhotoParts> {
  const person = raw.background ? Uint8Array.from(raw.background, (v) => Math.round(255 * clip(1 - v, 0, 1))) : null;
  const hasPerson = !!person && person.some((v) => v >= 128);
  const faces = raw.faces.map((f) => Float32Array.from(f, (v) => Math.round(v * 4096) / 4096));
  const p: Omit<PhotoParts, 'digest'> = {
    version: PARTS_VERSION,
    w: raw.w,
    h: raw.h,
    classes: hasPerson ? raw.classes : null,
    person: hasPerson ? person : null,
    object: raw.object ? toByte(raw.object) : null,
    cuts: raw.cuts.map(toByte),
    faces,
  };
  const head = new TextEncoder().encode(`${p.version};${p.w}x${p.h};${p.classes ? 1 : 0}${p.person ? 1 : 0}${p.object ? 1 : 0};${p.cuts.length};${faces.length}`);
  const bytes = concatBytes(head, p.classes ?? new Uint8Array(0), p.person ?? new Uint8Array(0), p.object ?? new Uint8Array(0), ...p.cuts, ...faces.map((f) => new Uint8Array(f.buffer, f.byteOffset, f.byteLength)));
  return { ...p, digest: toHex(await sha256(bytes)).slice(0, 16) };
}

/** A mask's value (0..1) at photo (u, v), bilinear between pixel centres. */
export function partAt(m: Uint8Array, p: { w: number; h: number }, u: number, v: number): number {
  const x = clip(u * p.w - 0.5, 0, p.w - 1);
  const y = clip(v * p.h - 0.5, 0, p.h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(p.w - 1, x0 + 1);
  const y1 = Math.min(p.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  return ((m[y0 * p.w + x0] * (1 - fx) + m[y0 * p.w + x1] * fx) * (1 - fy) + (m[y1 * p.w + x0] * (1 - fx) + m[y1 * p.w + x1] * fx) * fy) / 255;
}

/** The class at photo (u, v) (nearest pixel); background when there is no person. */
export function classAt(p: PhotoParts, u: number, v: number): number {
  if (!p.classes) return PART.background;
  return p.classes[clip(Math.floor(v * p.h), 0, p.h - 1) * p.w + clip(Math.floor(u * p.w), 0, p.w - 1)];
}

function boxOf(face: Float32Array, ids?: readonly number[]): [number, number, number, number] {
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  const n = ids ? ids.length : face.length / 2;
  for (let k = 0; k < n; k++) {
    const id = ids ? ids[k] : k;
    u0 = Math.min(u0, face[2 * id]);
    u1 = Math.max(u1, face[2 * id]);
    v0 = Math.min(v0, face[2 * id + 1]);
    v1 = Math.max(v1, face[2 * id + 1]);
  }
  return [u0, v0, u1, v1];
}

/** The face's box (all landmarks). */
export function faceBox(face: Float32Array): [number, number, number, number] {
  return boxOf(face);
}

/** The two eyes' boxes (their contours). */
export function eyeBoxes(face: Float32Array): [[number, number, number, number], [number, number, number, number]] {
  return [boxOf(face, EYE_A), boxOf(face, EYE_B)];
}
