import { sha256, toHex, type Hex64 } from '../engine/common/hash/sha256';
import { compositeWhite, fitPixels, readImageDimensions, validateSize, type RgbImage } from '../engine/common/image/normalize';

export interface LoadedSource {
  name: string;
  img: RgbImage;
  fileSha256: Hex64;
  fileBytes: number;
  hadTransparency: boolean;
}

export class DecodeError extends Error {
  constructor(
    readonly reason: 'unsupported' | 'broken' | 'file-too-large' | 'too-many-pixels' | 'invalid-dimensions' | 'too-long-side',
    message: string,
  ) {
    super(message);
  }
}

const BROKEN = 'このファイルは読み込めません（壊れているか、対応していない形式です）';

/**
 * JPEG/PNG → upright, white-composited RGB8 (R01). Size limits are checked from the header
 * before decoding. No ICC conversion (reference RGB contract, research R-06).
 */
export async function decodeFile(file: Blob, name = (file as File).name ?? ''): Promise<LoadedSource> {
  // Refused before reading: a huge file would be held in memory just to be turned down (008 FR-813).
  const early = validateSize(file.size, 1, 1);
  if (!early.ok) throw new DecodeError(early.reason, early.message);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = readImageDimensions(bytes);
  if (!header) {
    const looksJpegOrPng = bytes[0] === 0xff || bytes[0] === 0x89;
    throw new DecodeError(looksJpegOrPng ? 'broken' : 'unsupported', looksJpegOrPng ? BROKEN : 'JPEG または PNG の画像を選んでください');
  }
  const pre = validateSize(bytes.length, header.width, header.height);
  if (!pre.ok) throw new DecodeError(pre.reason, pre.message);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes]), {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
  } catch {
    throw new DecodeError('broken', BROKEN);
  }
  const { width, height } = bitmap;
  // The header reader and the browser may disagree on a malformed file: check what was actually decoded (FR-813).
  const post = validateSize(bytes.length, width, height);
  if (!post.ok) {
    bitmap.close();
    throw new DecodeError(post.reason, post.message);
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new DecodeError('too-many-pixels', '画像が大きすぎて、このブラウザでは開けません');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const { image, hadTransparency } = compositeWhite(rgba, width, height);
  // Photos above 12 million pixels (e.g. a standard iPhone photo) are reduced deterministically (FR-223).
  return { name, img: fitPixels(image), fileSha256: toHex(await sha256(bytes)), fileBytes: bytes.length, hadTransparency };
}
