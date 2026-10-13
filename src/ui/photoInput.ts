import { decodeFile } from '../app/decode';
import { prepareSource, withSource } from '../app/state';
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
    try {
      const loaded = await decodeFile(file);
      const source = await prepareSource(++sourceCounter, loaded);
      if (mine !== latest) return;
      // The workers get the photo in turn with the state, so no step still drawing the previous photo misses it (008 FR-810).
      ctx.update((s) => {
        if (mine !== latest) return s;
        ctx.controller().setSource(source.id, loaded.img, source.features);
        ui.sourceInfo.textContent = `${loaded.name}　${loaded.img.width}×${loaded.img.height}`;
        setNotices(ui.notices, [...ctx.lastingNotices, ...(loaded.hadTransparency ? [TRANSPARENCY_NOTICE] : [])]);
        return withSource(s, source);
      });
    } catch (e) {
      if (mine === latest) showMessage(ui.errors, loadErrorMessage(e));
    }
  });
}
