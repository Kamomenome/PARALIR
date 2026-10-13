// The AI runtime and models, bundled into the app (004 FR-402, research R-402). In the single-file build these
// imports are inlined data: URLs; at run time they become blob URLs and bytes, which file:// pages can read.
import loaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import faceUrl from '../../models/face_landmarker.task?url';
import touchUrl from '../../models/magic_touch.tflite?url';
import selfieUrl from '../../models/selfie_multiclass_256x256.tflite?url';

async function blobUrl(url: string, type: string): Promise<string> {
  const data = await (await fetch(url)).arrayBuffer();
  return URL.createObjectURL(new Blob([data], { type }));
}

async function bytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

type WasmFileset = { wasmLoaderPath: string; wasmBinaryPath: string };

let fileset: Promise<WasmFileset> | null = null;

/** The runtime's loader and binary as blob URLs (made once). */
export function wasmFileset(): Promise<WasmFileset> {
  fileset ??= Promise.all([blobUrl(loaderUrl, 'text/javascript'), blobUrl(wasmUrl, 'application/wasm')]).then(([wasmLoaderPath, wasmBinaryPath]) => ({ wasmLoaderPath, wasmBinaryPath }));
  return fileset;
}

export const MODEL_BYTES = {
  selfie: () => bytes(selfieUrl),
  face: () => bytes(faceUrl),
  touch: () => bytes(touchUrl),
};
