import { PARTS_VERSION, type PhotoParts } from './types';

/** PhotoParts as JSON (masks in base64), for the tools that make comparison sheets (004 T409). */
export interface PartsJson {
  version: typeof PARTS_VERSION;
  w: number;
  h: number;
  classes: string | null;
  person: string | null;
  object: string | null;
  cuts: string[];
  faces: number[][];
  digest: string;
}

function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function partsToJson(p: PhotoParts): PartsJson {
  return {
    version: p.version,
    w: p.w,
    h: p.h,
    classes: p.classes && toB64(p.classes),
    person: p.person && toB64(p.person),
    object: p.object && toB64(p.object),
    cuts: p.cuts.map(toB64),
    faces: p.faces.map((f) => Array.from(f)),
    digest: p.digest,
  };
}

export function partsFromJson(j: PartsJson): PhotoParts {
  if (j.version !== PARTS_VERSION) throw new Error(`未対応の部品の版です（${j.version}）`);
  return {
    version: j.version,
    w: j.w,
    h: j.h,
    classes: j.classes ? fromB64(j.classes) : null,
    person: j.person ? fromB64(j.person) : null,
    object: j.object ? fromB64(j.object) : null,
    cuts: j.cuts.map(fromB64),
    faces: j.faces.map((f) => Float32Array.from(f)),
    digest: j.digest,
  };
}
