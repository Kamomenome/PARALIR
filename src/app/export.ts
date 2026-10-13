import { EXPORT_SIZE } from '../engine/common/output';
import { APP_FILE_NAME } from './version';
import type { RenderController } from './controller';
import type { AppState } from './state';

export interface ExportHandle {
  jobId: number;
  /** PNG blob, or null when cancelled. Rejects on failure. */
  done: Promise<Blob | null>;
  cancel(): void;
}

/** The photo itself, in the frame the worlds use (011 FR-1101). */
export const PHOTO_MODE = 'photo';

/** Render job description (shared by preview and export): the spatial world draws whole frames. */
export function jobFor(state: AppState, _kind: 'preview' | 'export', _W: number, _H: number) {
  return {
    // The work's engine draws it, in the page and in the worker alike (009 FR-905); a new photo is shown as it is (011).
    mode: state.showing === 'photo' ? PHOTO_MODE : state.engineId,
    payload: structuredClone({
      world: state.spaceWorld,
      controls: state.spaceControls,
      type: state.spaceType === 'auto' ? undefined : state.spaceType,
      parts: state.spaceParts?.status === 'ok' ? state.spaceParts.parts : null,
      range: state.spaceRange,
    }),
  };
}

/**
 * 2400×1800 export from a snapshot of the state at the moment it starts (R11). Later UI changes
 * produce new state objects and never reach this job.
 */
export function startExport(controller: RenderController, state: AppState, onProgress: (f: number) => void): ExportHandle {
  const src = state.source;
  if (!src) throw new Error('写真がありません');
  const { width: W, height: H } = EXPORT_SIZE;
  const { jobId, promise } = controller.submit({ kind: 'export', sourceId: src.id, W, H, ...jobFor(state, 'export', W, H) }, (d, t) => onProgress(d / t));
  const done = promise.then(async (r) => {
    if (r.status === 'cancelled') return null;
    if (r.status === 'failed') throw new Error(r.error);
    return encodePng(r.pixels!, r.W, r.H);
  });
  return { jobId, done, cancel: () => controller.cancel(jobId) };
}

export async function encodePng(rgba: Uint8ClampedArray, W: number, H: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(W, H);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), W, H), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** File name of the work: paralir-<seed>-v<variation>-<world> (010 FR-1002). */
export function workName(state: AppState): string {
  const world = state.spaceType === 'auto' ? state.spaceWorld?.type ?? 'auto' : state.spaceType;
  return `${APP_FILE_NAME}-${state.spaceSeeds?.rootSeed.slice(0, 8) ?? 'none'}-v${state.variationIndex}-${world}`;
}
