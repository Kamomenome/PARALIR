// Downloads the on-device vision models into models/ (not committed) and checks their SHA-256 (004 R-404).
// Usage: npx tsx tools/fetch-models.ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MODELS = [
  {
    file: 'selfie_multiclass_256x256.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
    sha256: 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0',
  },
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  },
  {
    file: 'magic_touch.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite',
    sha256: 'e24338a717c1b7ad8d159666677ef400babb7f33b8ad60c4d96db4ecf694cd25',
  },
];

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

mkdirSync('models', { recursive: true });
for (const m of MODELS) {
  const path = join('models', m.file);
  if (existsSync(path) && sha(readFileSync(path)) === m.sha256) {
    console.log(`${m.file}: ok`);
    continue;
  }
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`${m.file}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (sha(bytes) !== m.sha256) throw new Error(`${m.file}: SHA-256 differs from the pinned model (${sha(bytes)})`);
  writeFileSync(path, bytes);
  console.log(`${m.file}: downloaded`);
}
