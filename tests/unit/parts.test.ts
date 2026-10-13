import { describe, expect, it } from 'vitest';
import { buildParts, eyeBoxes, faceBox, partAt, PARTS_VERSION } from '../../src/engine/common/parts/types';
import { figureParts, objectParts } from '../helpers/parts';

describe('photo parts (004 FR-404, SC-405)', () => {
  it('rounded, versioned, with a digest that follows the content', async () => {
    const a = await figureParts();
    const b = await figureParts();
    expect(a.version).toBe(PARTS_VERSION);
    expect(a.digest).toMatch(/^[0-9a-f]{16}$/);
    expect(a.digest).toBe(b.digest);
    expect(a.person![0]).toBe(0);
    expect(a.person![60 * 160 + 80]).toBe(255);
    for (const v of a.faces[0]) expect(Math.abs(v * 4096 - Math.round(v * 4096))).toBeLessThan(1e-3);
    const c = await objectParts([0.2, 0.2, 0.6, 0.6]);
    expect(c.digest).not.toBe(a.digest);
    expect(c.person).toBeNull();
    // A change of a landmark below the rounding step does not change the digest.
    const raw = (face: number[]) => buildParts({ w: 4, h: 3, classes: null, background: null, object: null, cuts: [], faces: [face] });
    expect((await raw([0.5, 0.5])).digest).toBe((await raw([0.5 + 1e-6, 0.5])).digest);
  });

  it('answers where things are', async () => {
    const p = await figureParts();
    expect(partAt(p.person!, p, 0.5, 0.6)).toBeCloseTo(1, 6);
    expect(partAt(p.person!, p, 0.1, 0.1)).toBe(0);
    const [u0, v0, u1, v1] = faceBox(p.faces[0]);
    expect(u0).toBeCloseTo(71 / 160, 2);
    expect(u1).toBeCloseTo(89 / 160, 2);
    expect(v0).toBeCloseTo(23 / 120, 2);
    expect(v1).toBeCloseTo(41 / 120, 2);
    const [ea, eb] = eyeBoxes(p.faces[0]);
    expect((ea[0] + ea[2]) / 2).toBeCloseTo(75 / 160, 2);
    expect((eb[0] + eb[2]) / 2).toBeCloseTo(85 / 160, 2);
  });
});
