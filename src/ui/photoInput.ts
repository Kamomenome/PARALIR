import { decodeFile } from '../app/decode';
import { prepareSource, withPhoto, withSource } from '../app/state';
import { snapshotNow, systemTimeZone } from '../engine/common/time/snapshot';
import type { AppContext } from './context';
import { showMessage } from './layout';
import { TRANSPARENCY_NOTICE, loadErrorMessage, setNotices } from './notices';

/** A photo chosen, dropped or picked with 別の写真 (007 FR-702). Only the last one chosen counts (008 FR-809). */
export function wirePhotoInput(ctx: AppContext): void {
  const { ui } = ctx;
  let latest = 0;
  let sourceCounter = 0;
  ui.onPhoto(async (file) => {
    const mine = ++latest;
    ui.errors.replaceChildren();
    const loading = ctx.busy.start('load');
    try {
      // Reading the file, then the photo's fingerprint and features: all of it is "loading".
      const { loaded, source } = await (async () => {
        const loaded = await decodeFile(file);
        return { loaded, source: await prepareSource(++sourceCounter, loaded) };
      })().finally(loading);
      if (mine !== latest) return;
      // The workers get the photo in turn with the state, so no step still drawing the previous photo misses it (008 FR-810).
      // The photo is shown as soon as it is read; the AI and the world follow behind it (012 FR-1203).
      ctx.update((s) => {
        if (mine !== latest) return s;
        ctx.controller().setSource(source.id, loaded.img, source.features);
        ui.sourceInfo.textContent = `${loaded.name}　${loaded.img.width}×${loaded.img.height}`;
        setNotices(ui.notices, [...ctx.lastingNotices, ...(loaded.hadTransparency ? [TRANSPARENCY_NOTICE] : [])]);
        return withPhoto(s, source, snapshotNow(Date.now(), systemTimeZone()));
      });
      const looking = ctx.busy.start('ai');
      ctx.update(async (s) => {
        try {
          return mine === latest && s.source === source ? await withSource(s, source) : s;
        } finally {
          looking();
        }
      });
    } catch (e) {
      if (mine === latest) showMessage(ui.errors, loadErrorMessage(e));
    }
  });
}
