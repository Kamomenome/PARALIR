/** Sliders of the spatial mode, all in [0,1]. They never change which random numbers are drawn. */
export interface SpaceControls {
  /** 奥行きの深さ: how far the repetition reaches and how fast it fades */
  depth: number;
  /** 有機構造の強さ: opacity/brightness of the grown arches and membranes */
  organic: number;
  /** 発光: flame glow and bloom */
  glow: number;
  /** 形を残す割合: size/opacity of the near, readable photo plates */
  shapeRetention: number;
  /** 霧と光の減衰 */
  fog: number;
  /** 画像特徴の影響 */
  featureInfluence: number;
}

export const SPACE_CONTROL_KEYS = ['depth', 'organic', 'glow', 'shapeRetention', 'fog', 'featureInfluence'] as const;

export const DEFAULT_SPACE_CONTROLS: SpaceControls = Object.freeze({
  depth: 0.5,
  organic: 0.6,
  glow: 0.5,
  shapeRetention: 0.5,
  fog: 0.5,
  featureInfluence: 0.75,
});

/**
 * Bumped whenever an algorithm's output changes. Phase 4: capsule tubes, flipped arches, translucent flat
 * plates, flame-tinted fog. Phase 5: photo-only materials (photo-skinned tubes and membranes, light and
 * fog from the photo's lights, flame points carry photo colours). Phase 6: seeded layout types.
 * Phase 7: seeded otherworldly recolouring. Phase 8: background × foreground × merge. Phase 9: photo-only foregrounds.
 */
export const SPACE_ALGORITHM_VERSIONS = Object.freeze({
  flame: 'flame-v3',
  growth: 'growth-v5',
  parts: 'parts-v5',
  composite: 'composite-v7',
  foregrounds: 'foregrounds-v1',
});

export type Vec3 = [number, number, number];
