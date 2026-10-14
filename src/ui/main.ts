import './style.css';
import { useOnDeviceAi } from '../ai/provider';
import { RenderController } from '../app/controller';
import { blockExternalRequests } from '../app/offline';
import { createInitialState, firstLook, restorePrevious, showPhoto, setLasso, setSpaceControls, setSpaceType, type AppState } from '../app/state';
import { chooseWorkers, createInlineWorker } from '../app/workers';
import { systemTimeZone } from '../engine/common/time/snapshot';
import type { SpaceWorld } from '../engine/space-v2/world';
import { buildAbout } from './about';
import { createBusy } from './busy';
import type { AppContext } from './context';
import { buildControls } from './controls';
import { buildExportPanel } from './exportPanel';
import { wireExport } from './exportActions';
import { keyAction } from './keys';
import { wireLasso } from './lassoInput';
import { buildLayout, h, showMessage } from './layout';
import { wirePhotoInput } from './photoInput';
import { previewer } from './preview';
import { buildSpacePanel } from './spacePanel';
import { buildTechPanel } from './techPanel';
import { partsOverlay } from './partsOverlay';

// Before anything else: nothing is sent off the device, whatever a library tries (004 FR-409).
blockExternalRequests();
useOnDeviceAi();

const ui = buildLayout(document.getElementById('app')!);
let state: AppState = createInitialState(Date.now(), systemTimeZone());

// The panel, top to bottom in the order of use (007 FR-703).
const controls = buildControls();
const exportPanel = buildExportPanel();
const spacePanel = buildSpacePanel(controls.root);
const tech = buildTechPanel(spacePanel.partsLine);
// Not folded away under 詳しい設定 (019 FR-1913): the items as they are; 技術的な表示 and このアプリについて open by their headings.
const more = h('div', { class: 'group more' }, tech.root, buildAbout());
ui.panel.append(spacePanel.root, h('div', { class: 'group output' }, exportPanel.root, exportPanel.status), more);
const photoHint = h('span', { class: 'note', 'data-testid': 'photo-hint', hidden: '' }, '元の写真です。「反映」を押すか、設定を変えると絵になります');
ui.caption.append(photoHint, ...spacePanel.captionItems);

// Workers are probed in the background; every change waits for them in the queue, so nothing done early is lost.
// If they cannot be prepared, draw in the page instead of dropping every action (008 FR-808).
let controller!: RenderController;
const lastingNotices: string[] = [];
const ready = chooseWorkers()
  .catch(() => ({ createWorker: createInlineWorker, poolSize: 1, inline: true }))
  .then((choice) => {
    controller = new RenderController(choice);
    if (choice.inline) {
      lastingNotices.push('このブラウザでは並列処理（Web Worker）が使えないため、画面の処理の中で描画します（遅くなります）');
      // Appended, not replacing: other notices (e.g. transparency) may already be shown.
      ui.notices.append(h('p', {}, lastingNotices[0]));
    }
  });

let chain: Promise<unknown> = ready;
const busy = createBusy((text) => {
  ui.busy.hidden = !text;
  ui.busyText.textContent = text ?? '';
});
const ctx: AppContext = {
  ui,
  busy,
  state: () => state,
  controller: () => controller,
  lastingNotices,
  update(fn) {
    ui.canvas.dataset.renderState = 'pending';
    chain = chain.then(async () => {
      try {
        state = await fn(state);
        refreshPanel();
        void renderPreview();
      } catch (e) {
        showMessage(ui.errors, `操作を反映できませんでした: ${e instanceof Error ? e.message : String(e)}`);
        ui.canvas.dataset.renderState = 'failed';
      }
    });
  },
};
const renderPreview = previewer(ctx);
const overlay = partsOverlay(ui);
tech.onShowParts((on) => overlay.set(on, state));
const lasso = wireLasso(ctx, () => spacePanel.lassoWorks());
let outlineVisible = true;
spacePanel.onOutline(() => {
  outlineVisible = !outlineVisible;
  lasso.setOutline(outlineVisible);
  spacePanel.setOutline(outlineVisible);
});

function refreshPanel() {
  tech.show(state);
  overlay.draw(state);
  controls.show(state.previous !== null, state.source !== null, state.showing);
  spacePanel.show(state.spaceControls, state.spaceType, true, state.spaceWorld?.type ?? null, state.spaceWorld?.hasSubject ?? true, state.spaceWorld as SpaceWorld | null);
  spacePanel.showParts(state.source ? state.spaceParts : null);
  spacePanel.showLasso(state.spaceRange, state.showing);
  lasso.draw(state);
  // Exporting only once the world is on screen (011 FR-1103).
  const world = state.showing === 'world';
  ui.canvas.dataset.showing = state.showing;
  photoHint.hidden = !state.source || world;
  // Until there is a photo the picture's place asks for one (007 FR-702).
  ui.canvas.hidden = !state.source;
  ui.drop.hidden = !!state.source;
  ui.changePhoto.hidden = !state.source;
  ui.caption.hidden = !state.source;
  exportPanel.setEnabled(state.source !== null && world);
  exportPanel.setSize(state.output);
  // The picture's box takes the picture's shape (018 FR-1802); 4:3 before any photo.
  ui.picture.style.setProperty('--aspect', state.source ? String(state.output.width / state.output.height) : String(4 / 3));
}

// Every action shows the world if the photo is still shown as it is (011 FR-1102).
const act = (fn: (s: AppState) => AppState | Promise<AppState>) => ctx.update((s) => firstLook(s, fn, true));
spacePanel.onSlider((patch) => act((s) => setSpaceControls(s, patch)));
// On the photo the lassos go and the photo stays; on the world it is drawn again without them (019 FR-1905).
spacePanel.onLassoClear(() => ctx.update((s) => setLasso(s, null)));
spacePanel.onType((t) => act((s) => setSpaceType(s, t)));
controls.onApply(() => ctx.update((s) => firstLook(s, (x) => x)));
controls.onShowPhoto(() => ctx.update(showPhoto));
controls.onRestore(() => ctx.update(restorePrevious));
// Ctrl+Z / ⌘Z: ひとつ戻す, unless the focused control has its own undo (007 FR-708).
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const action = keyAction(e, { tag: t.tagName, editable: t.isContentEditable });
  if (!action || e.repeat) return;
  e.preventDefault();
  if (action === 'restore' && state.previous) ctx.update(restorePrevious);
});
wireExport(ctx, exportPanel);
wirePhotoInput(ctx);

refreshPanel();
