/**
 * seeded32-v1 (docs/REPRODUCIBILITY.md §4): four uint32 words of state, xoshiro128**-style step.
 * For rendering only — not for authentication or keys.
 */
export class Seeded32 {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  /** Reads the first 16 bytes as four big-endian uint32; an all-zero state gets s3 = 1. */
  constructor(seed: Uint8Array) {
    if (seed.length < 16) throw new RangeError('seed needs at least 16 bytes');
    const dv = new DataView(seed.buffer, seed.byteOffset, 16);
    this.s0 = dv.getUint32(0);
    this.s1 = dv.getUint32(4);
    this.s2 = dv.getUint32(8);
    this.s3 = dv.getUint32(12);
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s3 = 1;
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** u ∈ [0, 1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

