import { saveBlob, startExport, workName, type ExportHandle } from '../app/export';
import type { AppContext } from './context';
import type { ExportPanel } from './exportPanel';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 2400×1800 export from the state at the moment it starts (R11); cancellable while running. */
export function wireExport(ctx: AppContext, panel: ExportPanel): void {
  let current: ExportHandle | null = null;
  panel.onExport(() => {
    const snapshot = ctx.state();
    if (!snapshot.source || current) return;
    try {
      current = startExport(ctx.controller(), snapshot, (f) => panel.setStatus(`書き出し中… ${Math.round(f * 100)}%`));
    } catch (e) {
      panel.setStatus(`書き出せません: ${message(e)}`);
      return;
    }
    panel.setRunning(true);
    panel.setStatus('書き出し中… 0%');
    current.done
      .then((blob) => {
        if (!blob) {
          panel.setStatus('書き出しをキャンセルしました');
          return;
        }
        saveBlob(blob, `${workName(snapshot)}.png`);
        panel.setStatus('書き出しました（開始時の設定で描画）');
      })
      .catch((e) => panel.setStatus(`書き出しに失敗しました（設定はそのままです）: ${message(e)}`))
      .finally(() => {
        current = null;
        panel.setRunning(false);
      });
  });
  panel.onCancel(() => current?.cancel());
}
