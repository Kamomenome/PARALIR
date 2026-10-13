import { useLassoCutter, usePartsProvider } from '../app/state';
import { hintPoints } from '../engine/common/parts/choice';
import { mainObject } from '../engine/space-v2/shared/object';

/**
 * The on-device AI sees each photo's parts once (004) and cuts things out inside a lasso (005); it is loaded only
 * when first needed. `?ai=off` draws with the estimate only.
 */
export function useOnDeviceAi(): void {
  usePartsProvider(async (src) => {
    if (new URLSearchParams(location.search).get('ai') === 'off') return { status: 'off', reason: 'URL の指定（ai=off）で止めています' };
    const t0 = performance.now();
    const { makeParts } = await import('./parts');
    const parts = await makeParts(src.loaded.img, hintPoints(mainObject(src.loaded.img, src.features)));
    return { status: 'ok', parts, ms: Math.round(performance.now() - t0) };
  });
  useLassoCutter(async (src, hints) => {
    const { cutsAt } = await import('./parts');
    return cutsAt(src.loaded.img, hints);
  });
}
