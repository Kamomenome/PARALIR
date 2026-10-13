import { describe, expect, it } from 'vitest';
import { bilinearReflect, clip, mirror, positiveMod, reflectIndex, smoothstep } from '../../src/engine/common/math';

describe('positiveMod', () => {
  it('returns values in [0, m) for negative inputs', () => {
    expect(positiveMod(-0.5, 2)).toBeCloseTo(1.5, 12);
    expect(positiveMod(-2, 2)).toBe(0);
    expect(positiveMod(-4.25, 2)).toBeCloseTo(1.75, 12);
    expect(positiveMod(3.5, 2)).toBeCloseTo(1.5, 12);
  });
});

describe('mirror', () => {
  it('stays in [0, 1] and has period 2', () => {
    for (let t = -10; t <= 10; t += 0.137) {
      const m = mirror(t);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
      expect(mirror(t + 2)).toBeCloseTo(m, 9);
    }
  });

  it('is a triangle wave: mirror(0)=0, mirror(1)=1, mirror(-0.25)=0.25', () => {
    expect(mirror(0)).toBe(0);
    expect(mirror(1)).toBe(1);
    expect(mirror(-0.25)).toBeCloseTo(0.25, 12);
    expect(mirror(1.5)).toBeCloseTo(0.5, 12);
  });
});

describe('clip / smoothstep', () => {
  it('clips into range', () => {
    expect(clip(-1, 0, 1)).toBe(0);
    expect(clip(2, 0, 1)).toBe(1);
    expect(clip(0.3, 0, 1)).toBe(0.3);
  });

  it('smoothstep is t²(3-2t) on [0,1] and clamped outside', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.25)).toBeCloseTo(0.0625 * 2.5, 12);
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
  });
});

describe('reflectIndex (half-sample symmetric, scipy mode="reflect")', () => {
  it('maps out-of-range indices back into the image', () => {
    expect(reflectIndex(-1, 4)).toBe(0);
    expect(reflectIndex(-2, 4)).toBe(1);
    expect(reflectIndex(4, 4)).toBe(3);
    expect(reflectIndex(5, 4)).toBe(2);
    expect(reflectIndex(2, 4)).toBe(2);
    expect(reflectIndex(0, 1)).toBe(0);
    expect(reflectIndex(-3, 1)).toBe(0);
  });
});

describe('bilinearReflect', () => {
  // 3x2, single-channel-like values replicated in RGB
  const w = 3;
  const h = 2;
  const vals = [0, 10, 20, 30, 40, 50];
  const data = new Float64Array(w * h * 3);
  vals.forEach((v, i) => data.set([v, v + 1, v + 2], i * 3));
  const img = { width: w, height: h, data };

  it('returns exact pixel values at integer coordinates', () => {
    const out = [0, 0, 0];
    bilinearReflect(img, 1, 1, out);
    expect(out).toEqual([40, 41, 42]);
  });

  it('weights neighbours with (1-dx)(1-dy), dx(1-dy), (1-dx)dy, dx*dy', () => {
    const out = [0, 0, 0];
    bilinearReflect(img, 0.25, 0.5, out);
    const expected = 0.75 * 0.5 * 0 + 0.25 * 0.5 * 10 + 0.75 * 0.5 * 30 + 0.25 * 0.5 * 40;
    expect(out[0]).toBeCloseTo(expected, 12);
  });

  it('reflects coordinates beyond the edge', () => {
    const out = [0, 0, 0];
    bilinearReflect(img, 2.5, 0, out); // between x=2 and reflected x=3 -> 2
    expect(out[0]).toBeCloseTo(20, 12);
  });
});
