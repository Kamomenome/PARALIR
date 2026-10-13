import type { RgbImage } from '../engine/common/image/normalize';
import type { FromWorker, ToWorker } from './protocol';
import { getRenderer, loadRenderer, type Renderer } from './renderers';

type RenderMessage = Extract<ToWorker, { type: 'render' }>;

/**
 * Message handling shared by the real Worker and the in-thread fallback (protocol.ts).
 * Stateless apart from the cached sources.
 */
export function createHandler(post: (msg: FromWorker, transfer?: Transferable[]) => void) {
  const sources = new Map<number, { img: RgbImage; features: unknown }>();
  const cancelled = new Set<number>();
  const fail = (jobId: number, e: unknown) => post({ type: 'error', jobId, message: e instanceof Error ? e.message : String(e) });

  const draw = (msg: RenderMessage, renderer: Renderer) => {
    try {
      const source = sources.get(msg.sourceId);
      if (!source) throw new Error(`source ${msg.sourceId} is not loaded`);
      const pixels = renderer({ src: source.img, features: source.features, payload: msg.payload, W: msg.W, H: msg.H });
      post({ type: 'frame', jobId: msg.jobId, pixels }, [pixels.buffer]);
    } catch (e) {
      fail(msg.jobId, e);
    }
  };

  return (msg: ToWorker) => {
    switch (msg.type) {
      case 'ping':
        post({ type: 'pong' });
        return;
      case 'setSource':
        // The new photo and the one before it: an export started on the previous photo can still finish (008 FR-806).
        sources.delete(msg.sourceId);
        sources.set(msg.sourceId, { img: msg.img, features: msg.features });
        while (sources.size > 2) sources.delete(sources.keys().next().value!);
        return;
      case 'cancel':
        cancelled.add(msg.jobId);
        if (cancelled.size > 256) cancelled.delete(cancelled.values().next().value!);
        return;
      case 'render': {
        if (cancelled.has(msg.jobId)) return;
        const renderer = getRenderer(msg.mode);
        if (renderer) return draw(msg, renderer);
        loadRenderer(msg.mode).then(
          (r) => (r ? draw(msg, r) : fail(msg.jobId, new Error(`unknown mode ${msg.mode}`))),
          (e) => fail(msg.jobId, e),
        );
        return;
      }
    }
  };
}
