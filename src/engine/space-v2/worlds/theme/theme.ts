import type { ImageFeatures } from '../../../common/analysis/features';
import type { RgbImage } from '../../../common/image/normalize';
import type { SeedInput } from '../../../common/seed/seeds';
import { lightShapeFrom, sphereTiltFor, type LightShape } from '../../shared/atmosphere';
import { newRgb, srgbToLinear, type Rgb3 } from '../../shared/color';
import { renderMosaic, type MosaicParams } from '../mosaic/mosaic';
import type { PhotoObject } from '../../shared/object';
import type { ForegroundAlgo } from '../../p9/background';
import { composeSpace, renderSpace, type SpaceComposition } from '../../p9/composite';
import { deriveSpaceSeeds as deriveP9Seeds } from '../../p9/seeds';
import { DEFAULT_SPACE_CONTROLS as P9_CONTROLS } from '../../p9/types';
import { drawsFrom } from '../../draws';
import type { SpaceControls } from '../../types';

/**
 * World ⑧ The theme (005 FR-502, FR-503; glossary: 「一番最初の基準画像」= the liked 002 Phase 9 sheet). The whole
 * frame is changed the Phase 9 way (the restored renderer, as the user liked it: the merge fixed to depth), and
 * one part of the photo — the theme — stays where it was, in the photo's own pixels, broken the way of the
 * rectangles (003 FR-317) that the user liked.
 */
export const THEME_FOREGROUNDS: ForegroundAlgo[] = ['plates', 'cutouts', 'contours', 'surface', 'kaleidoscope', 'rorschach'];

export interface ThemeParams {
  /** The Phase 9 composition, drawn from the 002 seed of the same photo, time and variation. */
  p9: SpaceComposition;
  foreground: ForegroundAlgo;
  /** The light's shape (005 FR-507): a ring about one time in five, else from an edge or in bands. */
  shape: LightShape;
}

export async function buildTheme(stream: Uint8Array, seedInput: SeedInput, features: ImageFeatures, img: RgbImage): Promise<ThemeParams> {
  const [[d], sh] = await Promise.all([drawsFrom(stream, 'theme/foreground', 1), drawsFrom(stream, 'theme/shape', 8)]);
  const p9Seeds = await deriveP9Seeds(['space-v1', ...seedInput.slice(1)] as SeedInput);
  const shape = lightShapeFrom(sh);
  const p9 = withShape({ ...(await composeSpace(p9Seeds, features, { ...P9_CONTROLS }, img)), shape }, shape);
  // Straight light: not the foregrounds that are radial by themselves (they would look round again).
  const choices = shape.kind === 'ring' ? THEME_FOREGROUNDS : THEME_FOREGROUNDS.filter((f) => f !== 'surface' && f !== 'kaleidoscope');
  return { p9, foreground: choices[Math.min(choices.length - 1, Math.floor(d * choices.length))], shape };
}

/** The Phase 9 composition with a light shape (as in 003, only round light looks into the sphere's pole). */
function withShape(p9: SpaceComposition, shape: LightShape): SpaceComposition {
  return { ...p9, shape, backgrounds: { ...p9.backgrounds, sphere: sphereTiltFor(p9.backgrounds.sphere, shape) } };
}

/** The Phase 9 picture of the theme world, in linear colour (the ground the theme is laid on). */
export function themeBase(t: ThemeParams, img: RgbImage, features: ImageFeatures, W: number, H: number, quality: number): Rgb3 {
  return groundOf(t.p9, t.foreground, img, features, W, H, quality);
}

function groundOf(p9: SpaceComposition, foreground: ForegroundAlgo, img: RgbImage, features: ImageFeatures, W: number, H: number, quality: number): Rgb3 {
  const { rgba } = renderSpace(p9, img, features, { ...P9_CONTROLS }, 'composite', W, H, { quality, pipeline: { foreground, merge: 'depth' } });
  const out = newRgb(W * H);
  for (let i = 0; i < W * H; i++) {
    out.r[i] = srgbToLinear(rgba[4 * i] / 255);
    out.g[i] = srgbToLinear(rgba[4 * i + 1] / 255);
    out.b[i] = srgbToLinear(rgba[4 * i + 2] / 255);
  }
  return out;
}

export function renderTheme(
  t: ThemeParams,
  mosaic: MosaicParams,
  range: PhotoObject,
  img: RgbImage,
  features: ImageFeatures,
  c: SpaceControls,
  W: number,
  H: number,
  quality: number,
): { rgba: Uint8ClampedArray; objects: Float32Array } {
  return renderMosaic(mosaic, range, img, c, W, H, themeBase(t, img, features, W, H, quality));
}
