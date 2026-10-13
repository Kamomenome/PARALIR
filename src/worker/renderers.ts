import type { ImageFeatures } from '../engine/common/analysis/features';
import type { RgbImage } from '../engine/common/image/normalize';
import { engineEntry, loadEngine, type Engine } from '../engine/engines';

/** Draws one whole W×H frame (RGBA) of a work with one engine. */
export type Renderer = (args: { src: RgbImage; features: unknown; payload: any; W: number; H: number }) => Uint8ClampedArray;

const registry = new Map<string, Renderer>();

export function registerRenderer(mode: string, fn: Renderer): void {
  registry.set(mode, fn);
}

export function getRenderer(mode: string): Renderer | undefined {
  return registry.get(mode);
}

/** The renderer of an engine, as the page's job payload (jobFor) describes the work. */
export const engineRenderer =
  (e: Engine): Renderer =>
  ({ src, features, payload, W, H }) =>
    e.render(payload.world, src, features as ImageFeatures, payload.controls, W, H, payload.type, undefined, payload.parts ?? null, payload.range ?? null).rgba;

/** A frozen engine is loaded the first time a work needs it (009 FR-905); undefined for an unknown mode. */
export async function loadRenderer(mode: string): Promise<Renderer | undefined> {
  const known = registry.get(mode);
  if (known || !engineEntry(mode)) return known;
  const fn = engineRenderer(await loadEngine(mode));
  registry.set(mode, fn);
  return fn;
}
