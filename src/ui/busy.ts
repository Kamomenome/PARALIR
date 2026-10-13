/** What the app is doing, in the order it is told: loading comes before the AI, the AI before drawing (012 FR-1201). */
export type BusyReason = 'load' | 'ai' | 'draw';
const ORDER: BusyReason[] = ['load', 'ai', 'draw'];

export const BUSY_TEXT: Record<BusyReason, string> = {
  load: '写真を読み込んでいます…',
  ai: 'AI が写真を見ています…',
  draw: '描いています…',
};

/** Work under this long is not shown, so quick steps do not flicker (FR-1202). */
export const BUSY_DELAY_MS = 150;

/**
 * Collects what is being done and shows the first reason's text (null: nothing) once work has lasted
 * BUSY_DELAY_MS. `start` returns the function that ends that piece of work.
 */
export function createBusy(show: (text: string | null) => void) {
  const counts: Record<BusyReason, number> = { load: 0, ai: 0, draw: 0 };
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const current = () => ORDER.find((r) => counts[r] > 0) ?? null;
  const refresh = () => {
    const reason = current();
    if (!reason) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (visible) show(null);
      visible = false;
      return;
    }
    if (visible) show(BUSY_TEXT[reason]);
    else if (!timer)
      timer = setTimeout(() => {
        timer = null;
        const r = current();
        if (!r) return;
        visible = true;
        show(BUSY_TEXT[r]);
      }, BUSY_DELAY_MS);
  };
  return {
    start(reason: BusyReason): () => void {
      counts[reason]++;
      refresh();
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        counts[reason]--;
        refresh();
      };
    },
  };
}
