import { describe, expect, it } from 'vitest';
import { decodeFile, DecodeError } from '../../src/app/decode';
import { MAX_SIDE, validateSize } from '../../src/engine/common/image/normalize';

describe('photos are refused before memory is spent on them (008 FR-813, SC-805)', () => {
  it('a file over 20 MiB is refused without reading it', async () => {
    let read = false;
    const huge = { size: 21 * 1024 * 1024, name: 'huge.jpg', arrayBuffer: async () => ((read = true), new ArrayBuffer(0)) } as unknown as File;
    await expect(decodeFile(huge)).rejects.toBeInstanceOf(DecodeError);
    await expect(decodeFile(huge)).rejects.toThrow('ファイルが大きすぎます');
    expect(read).toBe(false);
  });

  it('a side longer than 32767 px is refused in plain words', () => {
    expect(MAX_SIDE).toBe(32767);
    const r = validateSize(1000, 1, 40_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('画像の縦か横が長すぎます（上限 32767 px）');
    expect(validateSize(1000, 32767, 100).ok).toBe(true);
  });
});
