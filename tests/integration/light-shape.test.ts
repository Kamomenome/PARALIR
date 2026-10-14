import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInitialState, nextWorld, prepareSource, setSpaceControls, withSource, type AppState } from '../../src/app/state';
import { lightShapeFrom, shapeVariants } from '../../src/engine/space-v2/shared/atmosphere';
import { renderWorld, type SpaceWorld } from '../../src/engine/space-v2/world';
import { readPngRgb } from '../helpers/png';

const img = readPngRgb('tests/fixtures/images/scene.png');

async function photo() {
  const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
  return { src, s: await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src) };
}
const draw = (s: AppState, type: string) =>
  createHash('sha256')
    .update(renderWorld(s.spaceWorld as SpaceWorld, img, s.source!.features, s.spaceControls, 120, 90, type as any, 0.3, null, null).rgba)
    .digest('hex');

/** The drawn shape of the world's light for a mode: 0 round, 1 straight. */
const drawnEnd = (s: AppState, type: string) => {
  const w = s.spaceWorld as SpaceWorld;
  return (type === 'theme' ? w.theme.shape : w.atmosphere.shape).kind === 'ring' ? 0 : 1;
};

describe('光の形: round ↔ straight (019 FR-1907–1909, SC-1902)', () => {
  it('the opposite shape keeps the values drawn from the photo', () => {
    const ring = lightShapeFrom([0.1, 0.3, 0.4, 0.6, 0.2, 0.5, 0.7, 0.8]);
    const band = lightShapeFrom([0.8, 0.3, 0.4, 0.6, 0.2, 0.5, 0.7, 0.8]);
    expect(ring.kind).toBe('ring');
    expect(shapeVariants(ring)).toEqual({ ring, straight: { ...ring, kind: 'band' }, drawn: 0 });
    expect(shapeVariants(band)).toEqual({ ring: { ...band, kind: 'ring' }, straight: band, drawn: 1 });
    // A band from a ring is the band the same draws give (angle and width alike).
    expect({ ...ring, kind: 'band' }).toEqual(band);
  });

  for (const type of ['copies', 'split', 'theme']) {
    it(`${type}: without it the picture is as before; at the drawn end too; the other end and between differ`, async () => {
      let { s } = await photo();
      const kinds = new Set<number>();
      // Both a round and a straight drawn shape, over the first variations.
      for (let v = 0; v < 6 && kinds.size < 2; v++, s = await nextWorld(s)) {
        const end = drawnEnd(s, type);
        if (kinds.has(end)) continue;
        kinds.add(end);
        const plain = draw(s, type);
        expect(draw(setSpaceControls(s, { lightShape: end }), type)).toBe(plain);
        const other = draw(setSpaceControls(s, { lightShape: 1 - end }), type);
        const mid = draw(setSpaceControls(s, { lightShape: 0.5 }), type);
        expect(other).not.toBe(plain);
        expect(mid).not.toBe(plain);
        expect(mid).not.toBe(other);
      }
      expect(kinds.size).toBeGreaterThan(0);
    });
  }

  it('the mosaic and the nesting have no light shape', async () => {
    const { s } = await photo();
    for (const type of ['mosaic', 'echo']) expect(draw(setSpaceControls(s, { lightShape: 0.5 }), type)).toBe(draw(s, type));
  });
});
