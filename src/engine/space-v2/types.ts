/** The one slider (021 FR-2101): 変貌 in [0,1]. It never changes which random numbers are drawn. */
export interface SpaceControls {
  /** 0 the photo, 0.5 the world as drawn, 1 the world at its wildest (021 FR-2102, FR-2103). */
  morph: number;
}

export const DEFAULT_SPACE_CONTROLS: SpaceControls = Object.freeze({ morph: 0.5 });

/** How wild the world is beyond 0.5 (021 FR-2103): 0 up to 0.5, 1 at 1. */
export const chaosOf = (c: SpaceControls) => Math.max(0, Math.min(1, 2 * c.morph - 1));

/**
 * What the sliders taken out were set to, kept so the pictures at 変貌 0.5 stay the same: 光の強さ, 背景の暗さ and
 * 写真に合わせる強さ (020 FR-2003), 主役の大きさ and 長方形の数 (021 FR-2101).
 */
export const FIXED_LOOK = Object.freeze({ light: 0.5, darkness: 0.5, featureInfluence: 0.75, size: 0.5, count: 0.5 });

export type Vec3 = [number, number, number];
