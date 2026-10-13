/** Sliders of the spatial mode (space-v2, FR-309), all in [0,1]. They never change which random numbers are drawn. */
export interface SpaceControls {
  /** 光の強さ: the soft light behind copies, the beam / lamp in the darkness */
  light: number;
  /** 主役の大きさ */
  size: number;
  /** 数の多さ: how many objects float in the darkness (the first ones of a fixed list, so they stay put) */
  count: number;
  /** 背景の暗さ */
  darkness: number;
  /** 画像特徴の影響 (re-weights the odds of the worlds and the photo-driven choices); off the screen since 019 (FR-1911) */
  featureInfluence: number;
  /** 光の形 (019 FR-1907): 0 round, 1 straight, the two mixed between. Absent: the shape drawn from the photo (FR-1908). */
  lightShape?: number;
}

export const SPACE_CONTROL_KEYS = ['light', 'size', 'count', 'darkness', 'featureInfluence'] as const;
/** Controls a work has only once they are moved (019 FR-1908). */
export const OPTIONAL_SPACE_CONTROL_KEYS = ['lightShape'] as const;

export const DEFAULT_SPACE_CONTROLS: SpaceControls = Object.freeze({
  light: 0.5,
  size: 0.5,
  count: 0.5,
  darkness: 0.5,
  featureInfluence: 0.75,
});

export type Vec3 = [number, number, number];
