import type { AppState } from '../app/state';
import { frameOf } from '../engine/space-v2/shared/inplace';
import { mainObject } from '../engine/space-v2/shared/object';
import type { Layout } from './layout';
import { PARTS_LEGEND } from './techPanel';

const rgba = (css: string) => css.match(/[\d.]+/g)!.map(Number);

/**
 * What the AI saw, over the picture (016 FR-1603): the person, the cut-out object, the lasso's range, the estimated
 * subject's box and the faces, in the frame the worlds use. A layer of its own: never part of the picture or an export.
 */
export function partsOverlay(ui: Layout) {
  const canvas = document.createElement('canvas');
  canvas.className = 'parts-overlay';
  canvas.dataset.testid = 'parts-overlay';
  canvas.hidden = true;
  ui.picture.append(canvas);
  let on = false;

  function draw(s: AppState) {
    canvas.hidden = !on || !s.source;
    if (canvas.hidden || !s.source) return;
    const W = ui.canvas.width;
    const H = ui.canvas.height;
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const img = s.source.loaded.img;
    const f = frameOf(img, W, H);
    const parts = s.spaceParts?.status === 'ok' ? s.spaceParts.parts : null;
    const layers: [Uint8Array | null, number, number, number[]][] = [
      [parts?.person ?? null, parts?.w ?? 0, parts?.h ?? 0, rgba(PARTS_LEGEND[0][0])],
      [parts?.object ?? null, parts?.w ?? 0, parts?.h ?? 0, rgba(PARTS_LEGEND[1][0])],
      [s.spaceRange?.mask ?? null, s.spaceRange?.w ?? 0, s.spaceRange?.h ?? 0, rgba(PARTS_LEGEND[2][0])],
    ];
    const out = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = f.u0 + (x + 0.5) * f.du;
        const v = f.v0 + (y + 0.5) * f.dv;
        const o = (y * W + x) * 4;
        for (const [mask, mw, mh, [r, gg, b, a]] of layers) {
          if (!mask || u < 0 || v < 0 || u >= 1 || v >= 1) continue;
          const m = mask[Math.floor(v * mh) * mw + Math.floor(u * mw)] / 255;
          if (m < 0.5) continue;
          out.data[o] = r;
          out.data[o + 1] = gg;
          out.data[o + 2] = b;
          out.data[o + 3] = Math.round(a * 255);
        }
      }
    }
    g.putImageData(out, 0, 0);
    // The estimated subject's box, and the faces' landmarks.
    const toX = (u: number) => (u - f.u0) / f.du;
    const toY = (v: number) => (v - f.v0) / f.dv;
    const [u0, v0, u1, v1] = mainObject(img, s.source.features, parts).box;
    g.strokeStyle = PARTS_LEGEND[3][0];
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.strokeRect(toX(u0), toY(v0), toX(u1) - toX(u0), toY(v1) - toY(v0));
    g.fillStyle = PARTS_LEGEND[4][0];
    for (const face of parts?.faces ?? []) for (let k = 0; k < face.length; k += 2) g.fillRect(toX(face[k]) - 1, toY(face[k + 1]) - 1, 2, 2);
  }

  return {
    draw,
    set(value: boolean, s: AppState) {
      on = value;
      draw(s);
    },
  };
}
