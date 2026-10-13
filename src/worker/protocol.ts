import type { RgbImage } from '../engine/common/image/normalize';

/**
 * The messages between the page and a render worker, in one place for both sides (009 FR-907).
 * A job draws one whole frame with one engine (`mode` is the engine's id).
 */
export type ToWorker =
  | { type: 'ping' }
  | { type: 'setSource'; sourceId: number; img: RgbImage; features: unknown }
  | { type: 'cancel'; jobId: number }
  | { type: 'render'; jobId: number; sourceId: number; mode: string; payload: unknown; W: number; H: number };

export type FromWorker =
  | { type: 'pong' }
  | { type: 'frame'; jobId: number; pixels: Uint8ClampedArray }
  | { type: 'error'; jobId: number; message: string };
