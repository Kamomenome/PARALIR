import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInitialState, prepareSource, setLasso, withSource, type AppState } from '../../src/app/state';
import { SPACE_ALGORITHM_VERSIONS } from '../../src/engine/space-v2/versions';
import { renderWorld, type SpaceWorld } from '../../src/engine/space-v2/world';
import { readPngRgb } from '../helpers/png';

const img = readPngRgb('tests/fixtures/images/scene.png');
const left: [number, number][] = [[0.05, 0.1], [0.3, 0.1], [0.3, 0.6], [0.05, 0.6]];
const right: [number, number][] = [[0.6, 0.3], [0.95, 0.3], [0.95, 0.85], [0.6, 0.85]];

async function photo() {
  const src = await prepareSource(1, { name: 'scene.png', img, fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
  return { src, s: await withSource(createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo'), src) };
}
const draw = (s: AppState, type: string) =>
  createHash('sha256')
    .update(renderWorld(s.spaceWorld as SpaceWorld, img, s.source!.features, s.spaceControls, 160, 120, type as any, 0.4, null, s.spaceRange).rgba)
    .digest('hex');

describe('the lasso decides the subject in every way (013B FR-1309)', () => {
  it('copies, split and echo follow the lasso', async () => {
    const { s } = await photo();
    const lassoed = await setLasso(s, left);
    for (const type of ['copies', 'split', 'echo']) expect(draw(lassoed, type), type).not.toBe(draw(s, type));
  });

  it('their versions are raised', () => {
    // Raised from the versions before 013B (copies-v4, split-v4, echo-v1), and since.
    for (const [k, old] of [['copies', 'copies-v4'], ['split', 'split-v4'], ['echo', 'echo-v1']]) expect(SPACE_ALGORITHM_VERSIONS[k]).not.toBe(old);
  });
});

describe('several lassos with Shift (013B FR-1310, SC-1307)', () => {
  it('added lassos make one range of all of them; a plain lasso replaces them', async () => {
    const { s } = await photo();
    const a = await setLasso(s, left);
    const both = await setLasso(a, right, true);
    expect(both.spaceLassos).toHaveLength(2);
    const at = (st: AppState, u: number, v: number) => st.spaceRange!.mask[Math.floor(v * st.spaceRange!.h) * st.spaceRange!.w + Math.floor(u * st.spaceRange!.w)];
    expect(at(both, 0.15, 0.35)).toBeGreaterThan(128);
    expect(at(both, 0.8, 0.6)).toBeGreaterThan(128);
    expect(at(a, 0.8, 0.6)).toBeLessThan(128);
    const replaced = await setLasso(both, right);
    expect(replaced.spaceLassos).toHaveLength(1);
    expect((await setLasso(both, null)).spaceLassos).toHaveLength(0);
  });
});
