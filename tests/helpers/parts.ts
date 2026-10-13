import { buildParts, EYE_A, EYE_B, PART, type PhotoParts } from '../../src/engine/common/parts/types';

/**
 * Parts as the AI would give them for figurePhoto (tests/helpers/space2.ts): the head is face skin, the body
 * and arms are clothes, one face whose landmarks fill the head with both eyes in place. `leak`: like the real
 * segmenter, the background's confidence is not quite 1 away from the person.
 */
export async function figureParts(w = 160, h = 120, leak = 0): Promise<PhotoParts> {
  const classes = new Uint8Array(w * h);
  const background = new Float32Array(w * h).fill(1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) * 160) / w;
      const fy = ((y + 0.5) * 120) / h;
      const head = (fx - 80) ** 2 + (fy - 32) ** 2 < 11 ** 2;
      const body = (fx >= 64 && fx < 96 && fy >= 44 && fy < 100) || (fy >= 48 && fy < 58 && fx >= 46 && fx < 114);
      const i = y * w + x;
      classes[i] = head ? PART.faceSkin : body ? PART.clothes : PART.background;
      background[i] = head || body ? 0 : 1 - leak;
    }
  }
  // 478 landmarks on a ring inside the head; the eye contours at the eyes.
  const face: number[] = new Array(478 * 2);
  for (let k = 0; k < 478; k++) {
    const a = (2 * Math.PI * k) / 478;
    face[2 * k] = (80 + 9 * Math.cos(a)) / 160;
    face[2 * k + 1] = (32 + 9 * Math.sin(a)) / 120;
  }
  const eye = (ids: readonly number[], cx: number) =>
    ids.forEach((id, j) => {
      const a = (2 * Math.PI * j) / ids.length;
      face[2 * id] = (cx + 2.5 * Math.cos(a)) / 160;
      face[2 * id + 1] = (29 + 1.2 * Math.sin(a)) / 120;
    });
  eye(EYE_A, 75);
  eye(EYE_B, 85);
  return buildParts({ w, h, classes, background, object: null, cuts: [], faces: [face] });
}

/** Parts with no person: an object mask (a rectangle) only. */
export async function objectParts(box: [number, number, number, number], w = 160, h = 120): Promise<PhotoParts> {
  const object = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      object[y * w + x] = u >= box[0] && u < box[2] && v >= box[1] && v < box[3] ? 1 : 0;
    }
  }
  return buildParts({ w, h, classes: null, background: null, object, cuts: [object], faces: [] });
}
