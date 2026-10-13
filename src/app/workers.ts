import { createHandler } from '../worker/handler';
import '../worker/modes';
import { poolSizeFor, type WorkerLike } from './controller';
import RenderWorker from '../worker/render.worker?worker&inline';

/** Same message protocol, executed on the main thread (fallback when Workers are unavailable). */
export function createInlineWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    postMessage(msg) {
      setTimeout(() => handle(msg), 0);
    },
    terminate() {},
  };
  const handle = createHandler((msg) => w.onmessage?.({ data: msg }));
  return w;
}

export function defaultPoolSize(): number {
  return poolSizeFor(globalThis.navigator?.hardwareConcurrency ?? 2);
}

/** Resolves true when a real Worker starts and answers a ping (research R-03). */
// 5 s: under heavy CPU load a healthy worker can take seconds to start; falling back is costly.
export async function workersAvailable(timeoutMs = 5000): Promise<boolean> {
  let w: Worker;
  try {
    w = new RenderWorker();
  } catch {
    return false;
  }
  const ok = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    w.onmessage = (ev) => {
      if (ev.data?.type === 'pong') {
        clearTimeout(timer);
        resolve(true);
      }
    };
    w.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    w.postMessage({ type: 'ping' });
  });
  w.terminate();
  return ok;
}

/** Worker factory plus pool size: real workers when they start, otherwise one in-thread worker. */
export async function chooseWorkers(): Promise<{ createWorker: () => WorkerLike; poolSize: number; inline: boolean }> {
  if (await workersAvailable()) {
    return { createWorker: () => new RenderWorker() as unknown as WorkerLike, poolSize: defaultPoolSize(), inline: false };
  }
  return { createWorker: createInlineWorker, poolSize: 1, inline: true };
}
