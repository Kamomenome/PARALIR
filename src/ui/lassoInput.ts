import { setLasso, type AppState } from '../app/state';
import { simplifyLasso, type Lasso, type ThemeRange } from '../engine/common/parts/lasso';
import { frameOf } from '../engine/space-v2/shared/inplace';
import type { AppContext } from './context';
import { PARTS_LEGEND } from './techPanel';

/**
 * A rough lasso over the photo (005 FR-504; 019 FR-1901): drag to draw; the photo point under each canvas pixel.
 * It is drawn on the photo as it is, never on the transformed picture, and drawing does not transform it: 反映 does
 * (FR-1902). On the photo the lines and the range they give are shown, tinted (FR-1903); both can be hidden while the
 * lasso keeps working (011 FR-1105), and neither is part of an export. The overlay fills the picture's box, which
 * always has the canvas's shape.
 */
export function wireLasso(ctx: AppContext, lassoWorks: () => boolean = () => true): { draw(s: AppState): void; setOutline(visible: boolean): void } {
  const { ui } = ctx;
  const tint = document.createElement('canvas');
  tint.className = 'lasso-range';
  tint.dataset.testid = 'lasso-range';
  tint.hidden = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lasso');
  svg.setAttribute('data-testid', 'lasso-overlay');
  ui.picture.append(tint, svg);

  let outline = true;
  const onPhoto = () => ctx.state().showing === 'photo';
  const showLine = () => (svg.style.display = (outline && onPhoto()) || dragging ? '' : 'none');

  /** Every lasso of the work, and the one being drawn (open, not closed yet); on the photo only (FR-1904). */
  function lines(lassos: Lasso[], drawing: Lasso | null = null) {
    showLine();
    svg.setAttribute('viewBox', `0 0 ${ui.canvas.width} ${ui.canvas.height}`);
    const img = ctx.state().source?.loaded.img;
    svg.replaceChildren();
    if (!img || (!onPhoto() && !drawing)) return;
    const f = frameOf(img, ui.canvas.width, ui.canvas.height);
    for (const [k, lasso] of [...lassos, ...(drawing ? [drawing] : [])].entries()) {
      const pts = lasso.map(([u, v]) => `${((u - f.u0) / f.du).toFixed(1)},${((v - f.v0) / f.dv).toFixed(1)}`);
      if (lasso !== drawing && pts.length) pts.push(pts[0]);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('points', pts.join(' '));
      line.dataset.lasso = String(k);
      svg.append(line);
    }
  }

  /** The range the lassos give, tinted over the photo (FR-1903); drawn again only when it or the canvas changes. */
  let tinted: { range: ThemeRange; W: number; H: number } | null = null;
  function range(s: AppState) {
    const r = s.spaceRange;
    tint.hidden = !outline || !onPhoto() || !r || !s.source;
    if (tint.hidden || !r || !s.source) return;
    const W = ui.canvas.width;
    const H = ui.canvas.height;
    if (tinted && tinted.range === r && tinted.W === W && tinted.H === H) return;
    tinted = { range: r, W, H };
    tint.width = W;
    tint.height = H;
    const f = frameOf(s.source.loaded.img, W, H);
    const [cr, cg, cb, ca] = PARTS_LEGEND[2][0].match(/[\d.]+/g)!.map(Number);
    const out = new ImageData(W, H);
    for (let y = 0; y < H; y++) {
      const v = f.v0 + (y + 0.5) * f.dv;
      for (let x = 0; x < W; x++) {
        const u = f.u0 + (x + 0.5) * f.du;
        if (u < 0 || v < 0 || u >= 1 || v >= 1 || r.mask[Math.floor(v * r.h) * r.w + Math.floor(u * r.w)] < 128) continue;
        const o = (y * W + x) * 4;
        out.data[o] = cr;
        out.data[o + 1] = cg;
        out.data[o + 2] = cb;
        out.data[o + 3] = Math.round(ca * 0.7 * 255);
      }
    }
    tint.getContext('2d')!.putImageData(out, 0, 0);
  }

  const draw = (s: AppState) => {
    lines(s.spaceLassos);
    range(s);
  };

  let dragging: Lasso | null = null;
  /** Shift held when the drag began: the lasso is added to those there are (013B FR-1310). */
  let adding = false;
  /** Where the drag went on screen, to tell a loop from a click (008 FR-816). */
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const end = () => {
    dragging = null;
    box = null;
    draw(ctx.state());
  };
  const toPhoto = (e: PointerEvent): [number, number] | null => {
    const img = ctx.state().source?.loaded.img;
    if (!img) return null;
    const r = ui.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * ui.canvas.width;
    const y = ((e.clientY - r.top) / r.height) * ui.canvas.height;
    const f = frameOf(img, ui.canvas.width, ui.canvas.height);
    return [f.u0 + x * f.du, f.v0 + y * f.dv];
  };

  ui.canvas.addEventListener('pointerdown', (e) => {
    // The main button only: a right click opens the menu, it does not start a loop. On the photo only (FR-1901).
    if (!ctx.state().source || e.button !== 0 || !lassoWorks() || !onPhoto()) return;
    const p = toPhoto(e);
    if (!p) return;
    dragging = [p];
    adding = e.shiftKey;
    box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    showLine();
    ui.canvas.setPointerCapture(e.pointerId);
  });
  ui.canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !box) return;
    const p = toPhoto(e);
    if (p) dragging.push(p);
    box = { x0: Math.min(box.x0, e.clientX), y0: Math.min(box.y0, e.clientY), x1: Math.max(box.x1, e.clientX), y1: Math.max(box.y1, e.clientY) };
    // A plain drag replaces the lassos, so only the new one is shown while drawing.
    lines(adding ? ctx.state().spaceLassos : [], dragging);
  });
  ui.canvas.addEventListener('pointerup', () => {
    const pts = dragging;
    const b = box;
    const add = adding;
    end();
    // A click, or a hand that barely moved, keeps the lasso there is.
    const tiny = !b || Math.hypot(b.x1 - b.x0, b.y1 - b.y0) < 0.01 * ui.canvas.getBoundingClientRect().width;
    if (!pts || pts.length < 3 || tiny) return;
    // The photo stays: more lassos can be drawn, and 反映 transforms it (FR-1902).
    ctx.update((s) => setLasso(s, simplifyLasso(pts), add));
  });
  // A touch or pen taken over by the system leaves no loop behind.
  ui.canvas.addEventListener('pointercancel', end);
  ui.canvas.addEventListener('lostpointercapture', () => dragging && end());
  return {
    draw,
    setOutline(visible) {
      outline = visible;
      draw(ctx.state());
    },
  };
}
