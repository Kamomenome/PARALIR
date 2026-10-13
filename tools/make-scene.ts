// Draws tests/fixtures/images/scene.png: a made-up street at dusk for the tests, so no one's photo is in the
// repository (009 FR-922). Sky, hills, buildings with lit windows, one tall building as the subject, a road,
// a street lamp and a red sign — light, colour and edges like a real photo. Fixed numbers: always the same file.
// Usage: npx tsx tools/make-scene.ts
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export const SCENE = { width: 1200, height: 900, path: 'tests/fixtures/images/scene.png' };

export function drawScene(): PNG {
  const { width: W, height: H } = SCENE;
  const png = new PNG({ width: W, height: H });
  let seed = 0x2545f491;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const px = new Float32Array(W * H * 3);
  const set = (x: number, y: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) set(x, y, c);
  };
  const mix = (a: number[], b: number[], t: number) => a.map((v, k) => v + (b[k] - v) * t);

  // Sky: deep blue above, warm at the horizon.
  const horizon = 600;
  for (let y = 0; y < H; y++) {
    const t = Math.min(1, y / horizon);
    const c = t < 0.6 ? mix([18, 34, 96], [70, 96, 168], t / 0.6) : mix([70, 96, 168], [214, 146, 112], (t - 0.6) / 0.4);
    for (let x = 0; x < W; x++) set(x, y, c);
  }
  // Hills.
  for (let x = 0; x < W; x++) {
    const top = Math.round(540 + 30 * Math.sin(x / 140) + 18 * Math.sin(x / 47 + 1));
    for (let y = top; y < horizon + 40; y++) set(x, y, [28, 44, 40]);
  }
  // Buildings with lit windows; the tall white one in the middle is the subject.
  const buildings = [
    [0, 80, 260, [132, 128, 120]],
    [250, 420, 380, [96, 100, 112]],
    [380, 470, 560, [214, 216, 222]],
    [560, 250, 650, [62, 70, 90]],
    [650, 300, 980, [226, 228, 236]],
    [980, 330, 1200, [196, 176, 140]],
  ] as const;
  for (const [x0, top, x1, colour] of buildings) {
    rect(x0, top, x1, 780, [...colour]);
    for (let y = top + 20; y < 760; y += 34) {
      for (let x = x0 + 14; x < x1 - 24; x += 30) {
        const lit = rand() < 0.45;
        rect(x, y, x + 16, y + 20, lit ? [255, 214, 128] : mix([...colour], [30, 40, 60], 0.6));
      }
    }
  }
  // The subject's blue pattern.
  for (let y = 320; y < 760; y += 46) for (let x = 670; x < 960; x += 58) rect(x, y, x + 14, y + 14, [40, 70, 190]);
  // Road with lane marks, a red sign and a glowing lamp.
  rect(0, 780, W, H, [44, 44, 50]);
  for (let x = 40; x < W; x += 160) rect(x, 852, x + 90, 860, [220, 220, 220]);
  rect(20, 520, 170, 580, [214, 58, 48]);
  rect(40, 540, 150, 552, [250, 250, 250]);
  for (let y = 560; y < 880; y++) {
    for (let x = 180; x < 236; x++) {
      const d = Math.abs(x - 208) / 28;
      set(x, y, mix([255, 196, 96], [px[(y * W + x) * 3], px[(y * W + x) * 3 + 1], px[(y * W + x) * 3 + 2]], Math.min(1, d * d)));
    }
  }
  // Grain, like a camera's.
  for (let p = 0; p < W * H; p++) {
    const n = (rand() - 0.5) * 12;
    for (let k = 0; k < 3; k++) png.data[p * 4 + k] = Math.max(0, Math.min(255, Math.round(px[p * 3 + k] + n)));
    png.data[p * 4 + 3] = 255;
  }
  return png;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/make-scene.ts')) {
  writeFileSync(SCENE.path, PNG.sync.write(drawScene()));
  console.log(SCENE.path);
}
