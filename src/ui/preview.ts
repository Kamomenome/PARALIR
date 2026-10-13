import type { JobResult } from '../app/controller';
import { jobFor } from '../app/export';
import type { AppContext } from './context';
import { PREVIEW_H, PREVIEW_W, drawPixels, showMessage } from './layout';

/** Draws the preview of the current state; a newer preview supersedes it (R12). */
export function previewer(ctx: AppContext) {
  const { ui } = ctx;
  let seq = 0;
  return async function renderPreview(): Promise<JobResult | null> {
    const state = ctx.state();
    const src = state.source;
    if (!src) return null;
    ui.canvas.dataset.renderState = 'running';
    // Test hook for R12: makes the next preview fail inside the worker.
    const injectFailure = (window as any).__paralirInjectFailure === true;
    (window as any).__paralirInjectFailure = false;
    const job = jobFor(state, 'preview', PREVIEW_W, PREVIEW_H);
    if (injectFailure) job.mode = 'injected-failure';
    // The progress bar is there only while drawing (007 FR-707); a newer preview keeps it.
    const mine = ++seq;
    ui.progress.value = 0;
    ui.progress.hidden = false;
    const { promise } = ctx.controller().submit({ kind: 'preview', sourceId: src.id, W: PREVIEW_W, H: PREVIEW_H, ...job }, (done, total) => (ui.progress.value = done / total));
    const r = await promise;
    if (mine === seq) ui.progress.hidden = true;
    if (r.status === 'done') {
      ui.errors.replaceChildren();
      drawPixels(ui.canvas, r.pixels!, r.W, r.H);
      ui.canvas.dataset.renderState = 'done';
    } else if (r.status === 'failed') {
      showMessage(ui.errors, `描画に失敗しました（設定はそのままです）: ${r.error}`);
      ui.canvas.dataset.renderState = 'failed';
    }
    return r;
  };
}
