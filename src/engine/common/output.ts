/** The size of an exported picture. */
export interface OutputSize {
  width: number;
  height: number;
}

/** The size before any photo, and of works saved up to ver 1.32 (4:3). */
export const EXPORT_SIZE: OutputSize = { width: 2400, height: 1800 };
/** The long side of an export and of the preview (018 FR-1801). */
export const EXPORT_LONG = 2400;
export const PREVIEW_LONG = 960;

/** The photo's shape at `long` pixels on its long side (018 FR-1801): nothing of the photo is cut off. */
export function outputSize(aspect: number, long = EXPORT_LONG): OutputSize {
  return aspect >= 1 ? { width: long, height: Math.max(1, Math.round(long / aspect)) } : { width: Math.max(1, Math.round(long * aspect)), height: long };
}

/** The preview of an export: the same shape, 960 on its long side. */
export function previewSize(o: OutputSize): OutputSize {
  return outputSize(o.width / o.height, PREVIEW_LONG);
}
