import { describe, expect, it } from 'vitest';
import { analysisSize, downsampleArea } from '../../src/engine/common/analysis/downsample';
import { analyze, neutralFeatures, rgbToHsv } from '../../src/engine/common/analysis/features';
import type { RgbImage } from '../../src/engine/common/image/normalize';
import { makeScene, solid } from '../helpers/images';

const img = (w: number, h: number, px: number[]): RgbImage => ({ width: w, height: h, data: Uint8Array.from(px) });

function allFinite(f: ReturnType<typeof analyze>) {
  const nums = [f.L, f.K, f.S, f.H, f.E, f.D, f.P, ...f.hueHistogram];
  for (const m of Object.values(f.maps)) nums.push(...m);
  return nums.every(Number.isFinite);
}

describe('analysis size (analysis-v1)', () => {
  it('scales the long side to 256 and rounds the short side', () => {
    expect(analysisSize(1000, 500)).toEqual([256, 128]);
    expect(analysisSize(300, 301)).toEqual([Math.max(1, Math.floor((256 * 300) / 301 + 0.5)), 256]);
    expect(analysisSize(5000, 3)).toEqual([256, 1]);
  });

  it('never upscales small inputs', () => {
    expect(analysisSize(100, 50)).toEqual([100, 50]);
    expect(analysisSize(1, 1)).toEqual([1, 1]);
  });

  it('area-averages', () => {
    const src = { width: 512, height: 2, data: new Uint8Array(512 * 2 * 3) };
    for (let x = 0; x < 512; x++) for (let y = 0; y < 2; y++) src.data.fill(x % 2 ? 255 : 0, (y * 512 + x) * 3, (y * 512 + x) * 3 + 3);
    const d = downsampleArea(src);
    expect([d.width, d.height]).toEqual([256, 1]);
    for (const v of d.data) expect(v).toBeCloseTo(0.5, 12);
  });
});

describe('HSV', () => {
  it('follows the max/min definition with R→G→B tie order', () => {
    expect(rgbToHsv(1, 0, 0)).toEqual([0, 1, 1]);
    expect(rgbToHsv(0, 1, 0)[0]).toBeCloseTo(1 / 3, 12);
    expect(rgbToHsv(0, 0, 1)[0]).toBeCloseTo(2 / 3, 12);
    expect(rgbToHsv(1, 1, 0)[0]).toBeCloseTo(1 / 6, 12); // max tie R=G -> R branch
    expect(rgbToHsv(0.5, 0.5, 0.5)).toEqual([0, 0, 0.5]); // Δ=0
    expect(rgbToHsv(0, 0, 0)).toEqual([0, 0, 0]); // max=0
  });
});

describe('global features', () => {
  it('black/white 2×1: L=0.5, K=clip(2*0.5)=1, H=1/6', () => {
    const f = analyze(img(2, 1, [0, 0, 0, 255, 255, 255]));
    expect(f.L).toBeCloseTo(0.5, 12);
    expect(f.K).toBeCloseTo(1, 12);
    expect(f.H).toBeCloseTo(1 / 6, 12); // two equally likely bins: 1 bit / 6
    expect(f.S).toBe(0);
    expect(f.hueHistogram.reduce((a, b) => a + b, 0)).toBe(0);
    expect(f.D).toBe(0);
    expect(f.P).toBe(0);
  });

  it('puts Y=1.0 into the last luminance bin (H of a white image is 0)', () => {
    const f = analyze(solid(4, 4, [255, 255, 255]));
    expect(f.H).toBe(0);
    expect(f.L).toBeCloseTo(1, 12);
  });

  it('weights the 36 hue bins by saturation and computes the circular mean', () => {
    const f = analyze(img(2, 1, [255, 0, 0, 255, 0, 0]));
    expect(f.hueHistogram[0]).toBeCloseTo(1, 12);
    expect(f.D).toBeCloseTo(1, 12);
    expect(f.P).toBeCloseTo(0, 12);
    const g = analyze(img(1, 1, [0, 255, 0]));
    expect(g.hueHistogram[12]).toBeCloseTo(1, 12);
    expect(g.P).toBeCloseTo((2 * Math.PI) / 3, 12);
  });

  it('defines E as mean(G) of the gradient map', () => {
    const f = analyze(makeScene(64, 48));
    const G = f.maps.G;
    expect(f.E).toBeCloseTo(G.reduce((a, b) => a + b, 0) / G.length, 6);
  });
});

describe('local maps', () => {
  it('uses central differences with replicated edges and G = clip(4*|∇Y|, 0, 1)', () => {
    // Y = 0, 0.2, 0.4 along x (grey values)
    const v = [0, 51, 102].map((t) => [t, t, t]).flat();
    const f = analyze(img(3, 1, v));
    expect(Array.from(f.maps.gx).map((x) => +x.toFixed(6))).toEqual([0.1, 0.2, 0.1]);
    expect(Array.from(f.maps.gy)).toEqual([0, 0, 0]);
    expect(Array.from(f.maps.G).map((x) => +x.toFixed(6))).toEqual([0.4, 0.8, 0.4]);
  });
});

describe('degenerate images', () => {
  it.each([
    ['black', solid(8, 8, [0, 0, 0])],
    ['white', solid(8, 8, [255, 255, 255])],
    ['single colour', solid(8, 8, [10, 200, 90])],
    ['1×1', solid(1, 1, [128, 64, 32])],
    ['very tall', makeScene(1, 300)],
  ])('%s: all values finite', (_n, image) => {
    expect(allFinite(analyze(image))).toBe(true);
  });

  it('neutralFeatures keeps sizes and uses neutral values', () => {
    const f = analyze(makeScene(32, 24));
    const n = neutralFeatures(f);
    expect([n.L, n.K, n.S, n.H, n.E, n.D, n.P]).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0, 0]);
    expect(n.maps.G.every((v) => v === 0)).toBe(true);
    expect(n.maps.gx.length).toBe(f.maps.gx.length);
  });
});
