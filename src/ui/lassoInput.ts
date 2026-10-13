import { firstLook, setLasso } from '../app/state';
import { simplifyLasso, type Lasso } from '../engine/common/parts/lasso';
import { frameOf } from '../engine/space-v2/shared/inplace';
import type { AppContext } from './context';

/**
 * A rough lasso over the preview (005 FR-504): drag to draw; the photo point under each canvas pixel.
 * The overlay fills the picture's box, which always has the canvas's shape. Its line can be hidden while the
 * lasso keeps working (011 FR-1105); it is shown while drawing. The line is never part of an export.
 */
export function wireLasso(ctx: AppContext, lassoWorks: () => boolean = () => true): { draw(lasso: Lasso | null): void; setOutline(visible: boolean): void } {
  const { ui } = ctx;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lasso');
  svg.setAttribute('data-testid', 'lasso-overlay');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  svg.append(line);
  ui.picture.append(svg);

  let outline = true;
  const showLine = () => (svg.style.display = outline || dragging ? '' : 'none');

  function draw(lasso: Lasso | null, open = false) {
    showLine();
    svg.setAttribute('viewBox', `0 0 ${ui.canvas.width} ${ui.canvas.height}`);
    const img = ctx.state().source?.loaded.img;
    if (!lasso || !img) {
      line.setAttribute('points', '');
      return;
    }
    const f = frameOf(img, ui.canvas.width, ui.canvas.height);
    const pts = lasso.map(([u, v]) => `${((u - f.u0) / f.du).toFixed(1)},${((v - f.v0) / f.dv).toFixed(1)}`);
    if (!open && pts.length) pts.push(pts[0]);
    line.setAttribute('points', pts.join(' '));
  }

  let dragging: Lasso | null = null;
  /** Where the drag went on screen, to tell a loop from a click (008 FR-816). */
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const end = () => {
    dragging = null;
    box = null;
    draw(ctx.state().spaceLasso);
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
    // The main button only: a right click opens the menu, it does not start a loop.
    // Only where the template uses the lasso's range (017 FR-1706).
    if (!ctx.state().source || e.button !== 0 || !lassoWorks()) return;
    const p = toPhoto(e);
    if (!p) return;
    dragging = [p];
    box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    showLine();
    ui.canvas.setPointerCapture(e.pointerId);
  });
  ui.canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !box) return;
    const p = toPhoto(e);
    if (p) dragging.push(p);
    box = { x0: Math.min(box.x0, e.clientX), y0: Math.min(box.y0, e.clientY), x1: Math.max(box.x1, e.clientX), y1: Math.max(box.y1, e.clientY) };
    draw(dragging, true);
  });
  ui.canvas.addEventListener('pointerup', () => {
    const pts = dragging;
    const b = box;
    end();
    // A click, or a hand that barely moved, keeps the lasso there is.
    const tiny = !b || Math.hypot(b.x1 - b.x0, b.y1 - b.y0) < 0.01 * ui.canvas.getBoundingClientRect().width;
    if (!pts || pts.length < 3 || tiny) return;
    // A lasso on the photo as it is also shows the world (011 FR-1102).
    ctx.update((s) => firstLook(s, (t) => setLasso(t, simplifyLasso(pts)), true));
  });
  // A touch or pen taken over by the system leaves no loop behind.
  ui.canvas.addEventListener('pointercancel', end);
  ui.canvas.addEventListener('lostpointercapture', () => dragging && end());
  return {
    draw: (lasso) => draw(lasso),
    setOutline(visible) {
      outline = visible;
      showLine();
    },
  };
}
