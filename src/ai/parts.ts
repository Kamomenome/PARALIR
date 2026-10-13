// Makes a photo's parts with MediaPipe on the CPU, in the browser (004 FR-401). Only where things are: the person
// classes, the faces' landmarks, and — when there is no person — the object at the estimated subject.
import { FaceLandmarker, ImageSegmenter, InteractiveSegmenterLegacy, type MPMask } from '@mediapipe/tasks-vision';
import type { RgbImage } from '../engine/common/image/normalize';
import { chooseObject, isPerson } from '../engine/common/parts/choice';
import { buildParts, type PhotoParts } from '../engine/common/parts/types';
import { MODEL_BYTES, wasmFileset } from './assets';

/** Long side of the parts' masks. */
const PARTS_SIDE = 320;
/** Long side of the image given to the AI. */
const INPUT_SIDE = 1024;

interface Tasks {
  segmenter: ImageSegmenter;
  faces: FaceLandmarker;
  touch: InteractiveSegmenterLegacy;
}

let tasks: Promise<Tasks> | null = null;

function loadTasks(): Promise<Tasks> {
  tasks ??= (async () => {
    const files = await wasmFileset();
    const [selfie, face, touch] = await Promise.all([MODEL_BYTES.selfie(), MODEL_BYTES.face(), MODEL_BYTES.touch()]);
    const segmenter = await ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: selfie, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    });
    const faces = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: face, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 4 });
    const touchTask = await InteractiveSegmenterLegacy.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: touch, delegate: 'CPU' },
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    return { segmenter, faces, touch: touchTask };
  })();
  tasks.catch(() => (tasks = null));
  return tasks;
}

/** The photo, scaled down (box filter) to at most INPUT_SIDE, as ImageData. */
function toImageData(img: RgbImage): ImageData {
  const k = Math.min(1, INPUT_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * img.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = (sy * img.width + sx) * 3;
          r += img.data[p];
          g += img.data[p + 1];
          b += img.data[p + 2];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const q = (y * w + x) * 4;
      out.data[q] = Math.round(r / n);
      out.data[q + 1] = Math.round(g / n);
      out.data[q + 2] = Math.round(b / n);
      out.data[q + 3] = 255;
    }
  }
  return out;
}

/** A mask resampled (nearest at the cell centre) to the parts' size. */
function resample<T extends Float32Array | Uint8Array>(src: T, sw: number, sh: number, w: number, h: number, make: (n: number) => T): T {
  const out = make(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / h));
    for (let x = 0; x < w; x++) out[y * w + x] = src[sy * sw + Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / w))];
  }
  return out;
}

function floatMask(m: MPMask, w: number, h: number): Float32Array {
  return resample(m.getAsFloat32Array(), m.width, m.height, w, h, (n) => new Float32Array(n));
}

/**
 * The parts of a photo. `hints` are points of the estimated subject (normalised, engine/common/parts/choice hintPoints):
 * when there is no person, the object is cut out at each and the best cut is chosen (chooseObject).
 */
export async function makeParts(img: RgbImage, hints: [number, number][]): Promise<PhotoParts> {
  const t = await loadTasks();
  const image = toImageData(img);
  const k = PARTS_SIDE / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));

  const seg = t.segmenter.segment(image);
  const category = seg.categoryMask!;
  let classes: Uint8Array | null = resample(category.getAsUint8Array(), category.width, category.height, w, h, (n) => new Uint8Array(n));
  let background: Float32Array | null = floatMask(seg.confidenceMasks![0], w, h);
  seg.close();
  const faces = t.faces.detect(image).faceLandmarks.map((pts) => pts.flatMap((p) => [p.x, p.y]));
  let personShare = 0;
  for (const v of background) if (v < 0.5) personShare++;
  if (!isPerson(personShare / (w * h), faces.length)) {
    classes = null;
    background = null;
  }

  let object: Float32Array | null = null;
  const cuts: Float32Array[] = [];
  if (!background) {
    for (const [x, y] of hints) {
      const r = t.touch.segment(image, { keypoint: { x, y } });
      const masks = r.confidenceMasks ?? [];
      if (masks.length) cuts.push(floatMask(masks[masks.length - 1], w, h));
      r.close();
    }
    if (cuts.length) object = cuts[chooseObject(cuts)];
  }
  return buildParts({ w, h, classes, background, object, cuts, faces });
}

/**
 * Cut-outs at points inside a lasso (005 FR-504), on the same grid as the photo's parts, rounded to 8 bits. The
 * lasso's range is then chosen from these and the parts (engine/common/parts/lasso lassoRange).
 */
export async function cutsAt(img: RgbImage, hints: [number, number][]): Promise<Uint8Array[]> {
  const t = await loadTasks();
  const image = toImageData(img);
  const k = PARTS_SIDE / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const cuts: Uint8Array[] = [];
  for (const [x, y] of hints) {
    const r = t.touch.segment(image, { keypoint: { x, y } });
    const masks = r.confidenceMasks ?? [];
    if (masks.length) cuts.push(Uint8Array.from(floatMask(masks[masks.length - 1], w, h), (v) => Math.round(255 * Math.min(1, Math.max(0, v)))));
    r.close();
  }
  return cuts;
}
