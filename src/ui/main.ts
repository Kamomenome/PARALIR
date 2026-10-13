import './style.css';
import { useOnDeviceAi } from '../ai/provider';
import { RenderController } from '../app/controller';
import { blockExternalRequests } from '../app/offline';
import { createInitialState, nextWorld, restorePrevious, setLasso, setSpaceControls, setSpaceType, setTime, syncNow, type AppState } from '../app/state';
import { chooseWorkers, createInlineWorker } from '../app/workers';
import { formatOffset, snapshotFromLocal, systemTimeZone } from '../engine/common/time/snapshot';
import { buildAbout } from './about';
import type { AppContext } from './context';
import { buildControls } from './controls';
import { buildExportPanel } from './exportPanel';
import { wireExport } from './exportActions';
import { keyAction } from './keys';
import { wireLasso } from './lassoInput';
import { buildLayout, h, showMessage } from './layout';
import { wirePhotoInput } from './photoInput';
import { previewer } from './preview';
import { buildRecipePanel } from './recipePanel';
import { wireRecipes } from './recipeActions';
import { buildSpacePanel } from './spacePanel';
import { buildTimeControls } from './timeControls';

// Before anything else: nothing is sent off the device, whatever a library tries (004 FR-409).
blockExternalRequests();
useOnDeviceAi();

const ui = buildLayout(document.getElementById('app')!);
let state: AppState = createInitialState(Date.now(), systemTimeZone());

// The panel, top to bottom in the order of use (007 FR-703); the artwork time and recipe loading are folded away.
const artworkTime = h('span', { class: 'muted', 'data-testid': 'artwork-time' });
const timeControls = buildTimeControls(state.time);
const controls = buildControls();
const exportPanel = buildExportPanel();
const recipePanel = buildRecipePanel();
const spacePanel = buildSpacePanel(controls.root);
const details = h('details', { class: 'group details', 'data-testid': 'details' }, h('summary', {}, '詳しい設定', h('br'), artworkTime), timeControls.root, recipePanel.loadRoot, buildAbout());
ui.panel.append(spacePanel.root, h('div', { class: 'group output' }, h('div', { class: 'row' }, exportPanel.root, recipePanel.saveRoot), exportPanel.status, recipePanel.status), details);
ui.caption.append(...spacePanel.captionItems);

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
const ctx: AppContext = {
  ui,
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
const drawLasso = wireLasso(ctx);

function refreshPanel() {
  const t = state.time;
  artworkTime.textContent = `作品日時 ${t.localDateTime.replace('T', ' ')}　${t.timeZone}（UTC${formatOffset(t.offsetMinutes)}）`;
  timeControls.show(t);
  controls.show(state.variationIndex, state.previous !== null);
  spacePanel.show(state.spaceControls, state.spaceType, true, state.spaceWorld?.type ?? null, state.spaceWorld?.hasSubject ?? true);
  spacePanel.showParts(state.source ? state.spaceParts : null);
  spacePanel.showLasso(state.spaceRange);
  drawLasso(state.spaceLasso);
  recipePanel.setSaveEnabled(state.spaceWorld !== null);
  // Until there is a photo the picture's place asks for one (007 FR-702).
  ui.canvas.hidden = !state.source;
  ui.drop.hidden = !!state.source;
  ui.changePhoto.hidden = !state.source;
  ui.caption.hidden = !state.source;
  exportPanel.setEnabled(state.source !== null);
}

const { update } = ctx;
spacePanel.onSlider((patch) => update((s) => setSpaceControls(s, patch)));
spacePanel.onLassoClear(() => update((s) => setLasso(s, null)));
spacePanel.onType((t) => update((s) => setSpaceType(s, t)));
controls.onNextWorld(() => update(nextWorld));
controls.onRestore(() => update(restorePrevious));
timeControls.onChange((local, zone) => update((s) => setTime(s, snapshotFromLocal(local, zone))));
timeControls.onNow(() => update((s) => syncNow(s, Date.now())));
// Space: 別の世界, Ctrl+Z / ⌘Z: ひとつ戻す, unless the focused control needs the key (007 FR-708).
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const action = keyAction(e, { tag: t.tagName, editable: t.isContentEditable });
  if (!action || e.repeat) return;
  e.preventDefault();
  if (action === 'next') update(nextWorld);
  else if (state.previous) update(restorePrevious);
});
wireExport(ctx, exportPanel);
wireRecipes(ctx, recipePanel);
wirePhotoInput(ctx);

refreshPanel();
