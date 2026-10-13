import type { RenderContext } from '../worldDef';
import type { SpaceControls } from '../types';
import { renderShapedAtmosphere } from './atmosphere';
import { Hdr, bloom, chiaroscuro, tonemap, vignette } from './hdr';

/**
 * The 002 Phase 9 background the copies, the darkness and the split are drawn over (FR-314), dimmed by the
 * darkness slider; in the darkness-and-light world it sinks almost to black.
 */
export function backdrop(ctx: RenderContext, dark: boolean) {
  const c = ctx.controls;
  const look = { glow: c.light, fog: 0.5 };
  const hdr = new Hdr(ctx.W, ctx.H);
  // 光の形 (019 FR-1907): the drawn shape unless it was moved.
  const light = renderShapedAtmosphere(hdr, ctx.world.atmosphere, ctx.img, look, ctx.quality, c.lightShape);
  const bgK = dark ? 0.035 * (1.4 - c.darkness) : 1.3 - 0.6 * c.darkness;
  for (let i = 0; i < ctx.W * ctx.H; i++) {
    hdr.r[i] *= bgK;
    hdr.g[i] *= bgK;
    hdr.b[i] *= bgK;
  }
  return { hdr, light, look };
}

/** Lit like the plates in the liked images (dim photo surfaces in the background's light). */
export function dimPlates(layer: { r: Float32Array; g: Float32Array; b: Float32Array }, n: number): void {
  for (let i = 0; i < n; i++) {
    layer.r[i] *= 0.6;
    layer.g[i] *= 0.6;
    layer.b[i] *= 0.6;
  }
}

/** Bloom, vignette and (outside the darkness) the chiaroscuro curve, then the tone map — as in the liked images. */
export function finish(hdr: Hdr, c: SpaceControls, curve: boolean): Uint8ClampedArray {
  bloom(hdr, 0.45, 0.35 + 0.9 * c.light);
  vignette(hdr, 0.8);
  if (curve) chiaroscuro(hdr, 1.5);
  return tonemap(hdr, 1.5);
}
