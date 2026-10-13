import type { EffectiveFeatures } from '../../../common/analysis/effective';
import { drawsFrom } from '../draws';

/**
 * The type of space (Phase 6): chosen by the seed so variations differ in structure, not only in detail.
 * Image features only shift the odds. A fixed number of draws is always used.
 */
export type Arrangement = 'tunnel' | 'helix' | 'shell' | 'strata' | 'scatter';
export type GrowthForm = 'arches' | 'radial' | 'hanging' | 'spiral';
export type Symmetry = 'mirror' | 'rotational' | 'none';
export type LightMode = 'halo' | 'above' | 'side';

export interface SpaceLayout {
  arrangement: Arrangement;
  growthForm: GrowthForm;
  symmetry: Symmetry;
  /** Rotational order (3..6) when symmetry is rotational. */
  order: number;
  lightMode: LightMode;
  /** Void centre on screen, in half-heights from the frame centre (x right, y down). */
  voidCenter: [number, number];
  /** Light centre on screen, same units (the void for 'halo', above or beside the frame otherwise). */
  lightCenter: [number, number];
  /** Camera principal-point shift (vanishing point), same units. */
  vanish: [number, number];
  /** Camera roll; may turn the world upside down. */
  roll: number;
}

const LAYOUT_DRAWS = 14;

function pick<T extends string>(u: number, options: [T, number][]): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let t = u * total;
  for (const [v, w] of options) {
    if (t < w) return v;
    t -= w;
  }
  return options[options.length - 1][0];
}

export async function buildLayout(stream: Uint8Array, e: EffectiveFeatures): Promise<SpaceLayout> {
  const d = await drawsFrom(stream, 'layout/main', LAYOUT_DRAWS);
  // Busy photos lean towards fragmented/scattered spaces, calm ones towards enclosing ones.
  const busy = e.E;
  const arrangement = pick<Arrangement>(d[0], [
    ['tunnel', 1.1 - 0.4 * busy],
    ['helix', 1],
    ['shell', 1],
    ['strata', 1],
    ['scatter', 0.7 + 0.6 * busy],
  ]);
  const growthForm = pick<GrowthForm>(d[1], [
    ['arches', 1.1],
    ['radial', 1],
    ['hanging', 1],
    ['spiral', 0.8 + 0.4 * busy],
  ]);
  const symmetry = pick<Symmetry>(d[2], [
    ['mirror', 1.6],
    ['rotational', 1.1],
    ['none', 0.9],
  ]);
  const order = 3 + Math.floor(d[3] * 4);
  const lightMode = pick<LightMode>(d[4], [
    ['halo', 2],
    ['above', 1],
    ['side', 1],
  ]);
  // The void sits near the centre or anywhere around it (an ellipse that fits the landscape frame).
  const centred = d[5] < 0.4;
  const va = 2 * Math.PI * d[6];
  const vr = 0.3 + 0.4 * d[8];
  const voidCenter: [number, number] = centred
    ? [0.08 * (d[8] - 0.5), 0.08 * (d[9] - 0.5)]
    : [vr * Math.cos(va), 0.6 * vr * Math.sin(va)];
  // Light from beyond the frame: above (or below when the void sits high), or the side away from the void.
  const sx = voidCenter[0] > 0 || (voidCenter[0] === 0 && d[7] < 0.5) ? 1 : -1;
  const lightCenter: [number, number] =
    lightMode === 'halo'
      ? voidCenter
      : lightMode === 'above'
        ? [voidCenter[0] * 0.5, voidCenter[1] < -0.15 ? 1.05 : -1.05]
        : [-sx * 1.35, voidCenter[1] * 0.5 + 0.3 * (d[7] - 0.5)];
  const rollKind = d[10];
  const roll =
    rollKind < 0.6 ? (d[11] - 0.5) * 0.4 : rollKind < 0.85 ? (d[11] < 0.5 ? -1 : 1) * (0.4 + 0.8 * d[12]) : Math.PI + (d[11] - 0.5) * 0.4;
  return {
    arrangement,
    growthForm,
    symmetry,
    order,
    lightMode,
    voidCenter,
    lightCenter,
    // The structures converge where the void is: depth recedes into the dark.
    vanish: [voidCenter[0], voidCenter[1]],
    roll,
  };
}
