import { APP_NAME, APP_VERSION } from '../app/version';

export const PREVIEW_W = 960;
export const PREVIEW_H = 720;

/** Small DOM helper: h('div', { class: 'x', 'data-testid': 'y' }, child...) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

export interface Layout {
  fileInput: HTMLInputElement;
  sourceInfo: HTMLElement;
  notices: HTMLElement;
  errors: HTMLElement;
  progress: HTMLProgressElement;
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  stage: HTMLElement;
  /** The picture's box: the canvas, the lasso over it and the progress along its foot. */
  picture: HTMLElement;
  /** Shown instead of the canvas until there is a photo (007 FR-702). */
  drop: HTMLElement;
  changePhoto: HTMLButtonElement;
  /** The spinner and what is being done (012 FR-1201). */
  busy: HTMLElement;
  busyText: HTMLElement;
  /** The line under the picture for what is said about it (007 FR-704). */
  caption: HTMLElement;
  /** A photo chosen, dropped on the stage, or picked with 別の写真. */
  onPhoto(fn: (file: File) => void): void;
}

/** Left: the picture on a neutral wall. Right: the panel (007 FR-701). */
export function buildLayout(root: HTMLElement): Layout {
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png', 'data-testid': 'file-input', hidden: '' });
  const sourceInfo = h('span', { 'data-testid': 'source-info' });
  const notices = h('div', { class: 'notices', 'data-testid': 'notices', role: 'status' });
  const errors = h('div', { class: 'errors', 'data-testid': 'errors', role: 'alert' });
  const progress = h('progress', { class: 'progress', max: '1', value: '0', 'data-testid': 'progress', hidden: '' });
  const canvas = h('canvas', { width: String(PREVIEW_W), height: String(PREVIEW_H), 'data-testid': 'preview', hidden: '' });
  const drop = h(
    'button',
    { class: 'drop', type: 'button', 'data-testid': 'drop' },
    h('strong', {}, '写真を選ぶ'),
    h('span', {}, 'ここへドラッグしても入ります'),
    h('small', {}, 'JPEG・PNG。写真は端末の外へ送りません'),
  );
  const busyText = h('span', { class: 'busy-text' });
  const busy = h('div', { class: 'busy', 'data-testid': 'busy', role: 'status', hidden: '' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), busyText);
  const picture = h('div', { class: 'picture' }, canvas, drop, progress, busy);
  const changePhoto = h('button', { type: 'button', 'data-testid': 'change-photo', hidden: '' }, '別の写真');
  const caption = h('div', { class: 'caption' }, sourceInfo);
  const stage = h('main', { class: 'stage', 'data-testid': 'stage' }, h('div', { class: 'frame' }, picture), h('div', { class: 'under' }, h('div', { class: 'caption-row' }, caption, changePhoto), notices, errors), fileInput);
  const panel = h('aside', { class: 'panel', 'data-testid': 'panel' }, h('header', { class: 'name' }, h('h1', {}, APP_NAME), h('span', { class: 'muted', 'data-testid': 'app-version' }, `ver ${APP_VERSION}`)));
  root.replaceChildren(stage, panel);

  const fns: ((f: File) => void)[] = [];
  const give = (f: File | undefined) => f && fns.forEach((fn) => fn(f));
  fileInput.addEventListener('change', () => {
    give(fileInput.files?.[0]);
    fileInput.value = '';
  });
  drop.addEventListener('click', () => fileInput.click());
  changePhoto.addEventListener('click', () => fileInput.click());
  const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
  // A file dropped anywhere else must not make the browser open it and leave the work (008 FR-815).
  for (const type of ['dragover', 'drop'] as const) window.addEventListener(type, (e) => isFiles(e) && e.preventDefault());
  stage.addEventListener('dragover', (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    stage.classList.add('dragging');
  });
  stage.addEventListener('dragleave', (e) => {
    if (!stage.contains(e.relatedTarget as Node | null)) stage.classList.remove('dragging');
  });
  stage.addEventListener('drop', (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    stage.classList.remove('dragging');
    give(e.dataTransfer?.files[0]);
  });

  return { fileInput, sourceInfo, notices, errors, progress, canvas, panel, stage, picture, drop, changePhoto, busy, busyText, caption, onPhoto: (fn) => fns.push(fn) };
}

export function showMessage(target: HTMLElement, text: string): void {
  target.replaceChildren(h('p', {}, text));
}

export function drawPixels(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray, W: number, H: number): void {
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), W, H), 0, 0);
}
