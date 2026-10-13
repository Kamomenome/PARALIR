import { describe, expect, it } from 'vitest';
import type { RgbImage } from '../../src/engine/common/image/normalize';
import { estimateSubject } from '../../src/engine/space-v2/shared/subject';

const W = 160;
const H = 120;

/** A textured green-grey backdrop with a red-and-skin figure (head, body, arms) in the middle. */
function figurePhoto(): { img: RgbImage; inside: (x: number, y: number) => boolean } {
  const inside = (x: number, y: number) => {
    const head = (x - 80) ** 2 + (y - 32) ** 2 < 11 ** 2;
    const body = x >= 64 && x < 96 && y >= 44 && y < 100;
    const arms = y >= 48 && y < 58 && x >= 46 && x < 114;
    return head || body || arms;
  };
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = ((x * 7 + y * 13) % 9) / 8;
      const c = inside(x, y)
        ? (x - 80) ** 2 + (y - 32) ** 2 < 11 ** 2
          ? [225, 170, 140]
          : [200, 40, 50]
        : [70 + 30 * t, 110 + 25 * t, 80 + 20 * t];
      data.set(c.map(Math.round), (y * W + x) * 3);
    }
  }
  return { img: { width: W, height: H, data }, inside };
}

describe('subject estimation without AI (002 Phase 13, FR-228, SC-215)', () => {
  it('finds a figure that stands out from its backdrop', () => {
    const { img, inside } = figurePhoto();
    const s = estimateSubject(img);
    expect(s).not.toBeNull();
    if (!s) return;
    let fig = 0;
    let figIn = 0;
    let bg = 0;
    let bgIn = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const m = s.at((x + 0.5) / W, (y + 0.5) / H) > 0.5;
        if (inside(x, y)) {
          fig++;
          if (m) figIn++;
        } else {
          bg++;
          if (m) bgIn++;
        }
      }
    }
    expect(figIn / fig).toBeGreaterThanOrEqual(0.7);
    expect(bgIn / bg).toBeLessThanOrEqual(0.2);
    // The bounding box holds the figure (normalised photo coordinates).
    expect(s.box[0]).toBeLessThan(46 / W + 0.05);
    expect(s.box[2]).toBeGreaterThan(114 / W - 0.05);
  });

  it('a photo with nothing standing out has no subject', () => {
    const data = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(((x >> 3) + (y >> 3)) % 2 ? [200, 60, 60] : [60, 60, 200], (y * W + x) * 3);
    expect(estimateSubject({ width: W, height: H, data })).toBeNull();
    const flat = new Uint8Array(W * H * 3).fill(128);
    expect(estimateSubject({ width: W, height: H, data: flat })).toBeNull();
  });

  it('is deterministic', () => {
    const { img } = figurePhoto();
    const a = estimateSubject(img)!;
    const b = estimateSubject(img)!;
    expect(a.box).toEqual(b.box);
    expect(Buffer.compare(Buffer.from(a.mask.buffer), Buffer.from(b.mask.buffer))).toBe(0);
  });
});
