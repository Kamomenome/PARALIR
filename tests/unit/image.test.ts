import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  MAX_PIXELS,
  compositeWhite,
  crop,
  fitPixels,
  readImageDimensions,
  validateSize,
} from '../../src/engine/common/image/normalize';
import { pixelHash } from '../../src/engine/common/hash/sha256';

describe('compositeWhite', () => {
  it('turns fully transparent pixels white and keeps opaque ones', () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 0, 10, 20, 30, 255]);
    const { image, hadTransparency } = compositeWhite(rgba, 2, 1);
    expect(Array.from(image.data)).toEqual([255, 255, 255, 10, 20, 30]);
    expect(hadTransparency).toBe(true);
  });

  it('blends partial alpha with round(c*a/255 + 255*(1-a/255))', () => {
    const rgba = new Uint8ClampedArray([0, 100, 200, 128]);
    const { image } = compositeWhite(rgba, 1, 1);
    const f = (c: number) => Math.round((c * 128) / 255 + 255 * (1 - 128 / 255));
    expect(Array.from(image.data)).toEqual([f(0), f(100), f(200)]);
  });

  it('reports no transparency for opaque images', () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 255]);
    expect(compositeWhite(rgba, 1, 1).hadTransparency).toBe(false);
  });
});

describe('crop', () => {
  const img = { width: 3, height: 3, data: Uint8Array.from({ length: 27 }, (_, i) => i) };

  it('is identity with all-zero crop', () => {
    const out = crop(img, { left: 0, top: 0, right: 0, bottom: 0 });
    expect(out.width).toBe(3);
    expect(out.height).toBe(3);
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });

  it('removes rows and columns from each side', () => {
    const out = crop(img, { left: 1, top: 1, right: 0, bottom: 1 });
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    // row 1, columns 1..2
    expect(Array.from(out.data)).toEqual([12, 13, 14, 15, 16, 17]);
  });
});

describe('validateSize', () => {
  it('accepts sizes within the provisional limits (≤ 20 MiB, ≤ 12,000,000 px)', () => {
    expect(validateSize(MAX_FILE_BYTES, 4000, 3000).ok).toBe(true);
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_PIXELS).toBe(12_000_000);
  });

  it('rejects files over 20 MiB', () => {
    const r = validateSize(MAX_FILE_BYTES + 1, 10, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('file-too-large');
  });

  it('accepts photos up to 50,000,000 pixels (reduced after decoding, FR-223) and rejects larger ones', () => {
    expect(validateSize(1000, 4032, 3024).ok).toBe(true);
    expect(validateSize(1000, 7008, 4672).ok).toBe(true);
    const r = validateSize(1000, 8000, 7000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too-many-pixels');
  });

  it('rejects zero dimensions', () => {
    const r = validateSize(1000, 0, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-dimensions');
  });
});

describe('readImageDimensions', () => {
  it('reads PNG IHDR', () => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, 5000);
    new DataView(b.buffer).setUint32(20, 4000);
    expect(readImageDimensions(b)).toEqual({ format: 'png', width: 5000, height: 4000 });
  });

  it('reads JPEG SOF0', () => {
    const b = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x14, 0x00, 0x28, 0x03,
    ]);
    expect(readImageDimensions(b)).toEqual({ format: 'jpeg', width: 40, height: 20 });
  });

  it('returns null for unsupported or broken data', () => {
    expect(readImageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe('fitPixels (FR-223, SC-210)', () => {
  const make = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 3);
    return { width: w, height: h, data };
  };

  it.each([
    [4032, 3024],
    [7008, 4672],
    [3024, 4032],
  ])('%i×%i is reduced to at most 12,000,000 pixels with the same aspect (±1 px)', (w, h) => {
    const out = fitPixels(make(w, h, () => [10, 20, 30]));
    expect(out.width * out.height).toBeLessThanOrEqual(MAX_PIXELS);
    expect(out.width * out.height).toBeGreaterThan(0.98 * MAX_PIXELS);
    expect(Math.abs(out.height - (out.width * h) / w)).toBeLessThanOrEqual(1);
    // A flat colour stays exactly that colour.
    let off = 0;
    for (let i = 0; i < out.data.length; i += 3) if (out.data[i] !== 10 || out.data[i + 1] !== 20 || out.data[i + 2] !== 30) off++;
    expect(off).toBe(0);
  });

  it('is deterministic: the same input gives the same pixels and pixel hash', async () => {
    const img = make(4032, 3024, (x, y) => [(x * 7 + y) % 256, (x ^ y) % 256, (x * y) % 256]);
    const a = fitPixels(img);
    const b = fitPixels(img);
    expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))).toBe(0);
    expect(await pixelHash(a)).toBe(await pixelHash(b));
  });

  it('leaves photos within the limit untouched', () => {
    const img = make(400, 300, () => [1, 2, 3]);
    expect(fitPixels(img)).toBe(img);
  });
});
