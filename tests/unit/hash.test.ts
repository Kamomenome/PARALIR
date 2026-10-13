import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pixelHash, sha256, toHex } from '../../src/engine/common/hash/sha256';

function expectedPixelHash(w: number, h: number, rgb: number[]): string {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  return createHash('sha256').update(head).update(Buffer.from(rgb)).digest('hex');
}

describe('sha256', () => {
  it('matches node:crypto', async () => {
    const bytes = new TextEncoder().encode('変貌世界');
    expect(toHex(await sha256(bytes))).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});

describe('pixelHash', () => {
  it('is SHA256(widthBE32 || heightBE32 || rowMajorRGB8) in lowercase hex', async () => {
    const rgb = [255, 0, 0, 0, 0, 255];
    const h = await pixelHash({ width: 2, height: 1, data: Uint8Array.from(rgb) });
    expect(h).toBe(expectedPixelHash(2, 1, rgb));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distinguishes 2x1 from 1x2 with identical bytes', async () => {
    const rgb = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    const a = await pixelHash({ width: 2, height: 1, data: rgb });
    const b = await pixelHash({ width: 1, height: 2, data: rgb });
    expect(a).not.toBe(b);
  });
});
