import { existsSync } from 'node:fs';
import type { RgbImage } from '../../src/engine/common/image/normalize';
import { readPngRgb } from './png';

/**
 * The real photo the liked pictures and some looks were judged on. It is kept out of the repository (009 FR-922):
 * where it is (samples/reference/, not in git) those checks run; elsewhere, e.g. in CI, they are skipped.
 */
export const REAL_PHOTO_PATH = 'samples/reference/decoded-source.png';
export const realPhoto: RgbImage | null = existsSync(REAL_PHOTO_PATH) ? readPngRgb(REAL_PHOTO_PATH) : null;
