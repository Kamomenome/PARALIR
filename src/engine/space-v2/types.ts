/** Sliders of the spatial mode (space-v2, FR-309), all in [0,1]. They never change which random numbers are drawn. */
export interface SpaceControls {
  /** 主役の大きさ */
  size: number;
  /** 長方形の数 (the rectangles and the theme) */
  count: number;
  /** 光の形 (019 FR-1907): 0 round, 1 straight, the two mixed between. Absent: the shape drawn from the photo (FR-1908). */
  lightShape?: number;
}

export const DEFAULT_SPACE_CONTROLS: SpaceControls = Object.freeze({
  size: 0.5,
  count: 0.5,
});

/**
 * What the sliders taken out in 020 (FR-2003) were set to: 光の強さ, 背景の暗さ and 写真に合わせる強さ, kept as they
 * were so the pictures stay the same.
 */
export const FIXED_LOOK = Object.freeze({ light: 0.5, darkness: 0.5, featureInfluence: 0.75 });

export type Vec3 = [number, number, number];
