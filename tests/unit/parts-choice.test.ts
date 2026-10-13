import { describe, expect, it } from 'vitest';
import { chooseByOverlap, chooseCircled, chooseObject, hintPoints, isPerson } from '../../src/engine/common/parts/choice';

const mask = (share: number, n = 1000) => Float32Array.from({ length: n }, (_, i) => (i < share * n ? 0.9 : 0.1));

describe('judging what the AI found (004 FR-401)', () => {
  it('a person is a large region, or a smaller one with a face', () => {
    expect(isPerson(0.009, 0)).toBe(false);
    expect(isPerson(0.009, 1)).toBe(true);
    expect(isPerson(0.004, 1)).toBe(false);
    expect(isPerson(0.04, 0)).toBe(true);
  });

  it('the object: the largest cut-out up to half the photo, else the smallest', () => {
    expect(chooseObject([mask(0.02), mask(0.3), mask(0.7), mask(0.1)])).toBe(1);
    expect(chooseObject([mask(0.8), mask(0.6)])).toBe(1);
    expect(chooseObject([mask(0)])).toBe(0);
  });

  it('the candidate that overlaps the aim most; none when even the best overlaps little (004 SC-409)', () => {
    const bits = (s: string) => Uint8Array.from(s, (c) => (c === '1' ? 1 : 0));
    const aim = bits('0011110000');
    expect(chooseByOverlap(aim, [bits('1111111111'), bits('0011100000'), bits('0000011100')])).toBe(1);
    expect(chooseByOverlap(aim, [bits('1000000001')])).toBe(-1);
    expect(chooseByOverlap(aim, [])).toBe(-1);
  });

  it('a rough loop: the largest candidate that lies inside it, else one that overlaps it a lot, else none (005 SC-503)', () => {
    const bits = (s: string) => Uint8Array.from(s, (c) => (c === '1' ? 1 : 0));
    const loop = bits('000111111000');
    // A small thing inside (the head) beats a big thing sticking out (the whole person, IoU 0.5).
    expect(chooseCircled(loop, [bits('111111111111'), bits('000011100000')])).toBe(1);
    // Of two inside, the larger.
    expect(chooseCircled(loop, [bits('000110000000'), bits('000111110000')])).toBe(1);
    // Nothing inside, but one overlaps a lot (IoU >= 0.5).
    expect(chooseCircled(loop, [bits('000111111111')])).toBe(0);
    // Nothing fits.
    expect(chooseCircled(loop, [bits('110000000011')])).toBe(-1);
  });

  it('five hints inside the estimated subject: its centre and the centres of its four quarters', () => {
    const h = hintPoints({ crop: [0.5, 0.4, 0.2], box: [0.2, 0.2, 0.6, 0.8] });
    expect(h[0]).toEqual([0.5, 0.4]);
    const quarters = [
      [0.3, 0.35],
      [0.5, 0.35],
      [0.3, 0.65],
      [0.5, 0.65],
    ];
    quarters.forEach(([u, v], k) => {
      expect(h[k + 1][0]).toBeCloseTo(u, 12);
      expect(h[k + 1][1]).toBeCloseTo(v, 12);
    });
  });
});
