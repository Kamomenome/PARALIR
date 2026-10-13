import { h } from './layout';

export interface ExportPanel {
  root: HTMLElement;
  status: HTMLElement;
  onExport(fn: () => void): void;
  onCancel(fn: () => void): void;
  setRunning(running: boolean): void;
  setStatus(text: string): void;
  setEnabled(enabled: boolean): void;
}

export function buildExportPanel(): ExportPanel {
  const exportBtn = h('button', { 'data-testid': 'export' }, '2400×1800 で書き出す');
  const cancelBtn = h('button', { 'data-testid': 'export-cancel', hidden: '' }, 'キャンセル');
  const status = h('p', { class: 'muted', 'data-testid': 'export-status' });
  const root = h('div', { class: 'row' }, exportBtn, cancelBtn);
  let running = false;
  let enabled = false;
  const refresh = () => {
    exportBtn.disabled = running || !enabled;
    // The cancel button exists only while exporting (007 FR-707).
    cancelBtn.hidden = !running;
  };
  return {
    root,
    status,
    onExport: (fn) => exportBtn.addEventListener('click', fn),
    onCancel: (fn) => cancelBtn.addEventListener('click', fn),
    setRunning(r) {
      running = r;
      refresh();
    },
    setStatus: (t) => (status.textContent = t),
    setEnabled(e) {
      enabled = e;
      refresh();
    },
  };
}
