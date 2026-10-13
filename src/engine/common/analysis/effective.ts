import { neutralFeatures, sampleMap, type FeatureMaps, type ImageFeatures } from './features';

/** Features blended between neutral (influence 0) and measured (influence 1). */
export interface EffectiveFeatures {
  L: number;
  K: number;
  S: number;
  H: number;
  E: number;
  D: number;
  P: number;
  w: number;
  h: number;
  maps: FeatureMaps;
  /** Low-pass G and S for the grain field, so regions follow the photo's broad structure (Phase 9). */
  smooth: { G: Float32Array; S: Float32Array };
}

/** Three passes of a separable box blur (≈ Gaussian), edges clamped. */
export function blurMap(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const n = horizontal ? w : h;
    const lines = horizontal ? h : w;
    for (let l = 0; l < lines; l++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) {
          const j = Math.min(n - 1, Math.max(0, i + k));
          s += from[horizontal ? l * w + j : j * w + l];
        }
        to[horizontal ? l * w + i : i * w + l] = s / (2 * radius + 1);
      }
    }
  };
  for (let p = 0; p < 3; p++) {
    pass(a, b, true);
    pass(b, a, false);
  }
  return a;
}

const cache = new WeakMap<ImageFeatures, Map<number, EffectiveFeatures>>();

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function effectiveFeatures(f: ImageFeatures, influence: number): EffectiveFeatures {
  let byInfluence = cache.get(f);
  if (!byInfluence) cache.set(f, (byInfluence = new Map()));
  const hit = byInfluence.get(influence);
  if (hit) return hit;
  const n = neutralFeatures(f);
  const t = influence;
  const blend = (a: Float32Array, b: Float32Array) => {
    if (t === 1) return b;
    if (t === 0) return a;
    const out = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
    return out;
  };
  // The hue direction P is only meaningful together with its concentration D, so D carries the blend.
  const G = blend(n.maps.G, f.maps.G);
  const S = blend(n.maps.S, f.maps.S);
  const radius = Math.max(1, Math.round(Math.max(f.analysisWidth, f.analysisHeight) / 24));
  const e: EffectiveFeatures = {
    L: lerp(n.L, f.L, t),
    K: lerp(n.K, f.K, t),
    S: lerp(n.S, f.S, t),
    H: lerp(n.H, f.H, t),
    E: lerp(n.E, f.E, t),
    D: lerp(n.D, f.D, t),
    P: f.P,
    w: f.analysisWidth,
    h: f.analysisHeight,
    maps: {
      Y: blend(n.maps.Y, f.maps.Y),
      S,
      gx: blend(n.maps.gx, f.maps.gx),
      gy: blend(n.maps.gy, f.maps.gy),
      G,
    },
    smooth: {
      G: blurMap(G, f.analysisWidth, f.analysisHeight, radius),
      S: blurMap(S, f.analysisWidth, f.analysisHeight, radius),
    },
  };
  byInfluence.set(influence, e);
  return e;
}

export function lookup(e: EffectiveFeatures, map: keyof FeatureMaps, u: number, v: number): number {
  return sampleMap(e.maps[map], e.w, e.h, u, v);
}

