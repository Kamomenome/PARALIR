import { describe, expect, it } from 'vitest';
import { RenderController, type WorkerLike } from '../../src/app/controller';
import type { ToWorker } from '../../src/worker/protocol';

/** Worker double: answers each whole-frame render with the frame filled by the job's payload (a byte). */
function fakeWorkerFactory(opts: { delayMs?: number; failPayload?: unknown } = {}) {
  const posted: ToWorker[] = [];
  const create = (): WorkerLike => {
    const w: WorkerLike = {
      onmessage: null,
      postMessage(msg) {
        posted.push(msg);
        if (msg.type !== 'render') return;
        setTimeout(() => {
          if (opts.failPayload !== undefined && msg.payload === opts.failPayload) {
            w.onmessage?.({ data: { type: 'error', jobId: msg.jobId, message: 'boom' } });
            return;
          }
          const pixels = new Uint8ClampedArray(msg.W * msg.H * 4).fill(Number(msg.payload ?? 1));
          w.onmessage?.({ data: { type: 'frame', jobId: msg.jobId, pixels } });
        }, opts.delayMs ?? 0);
      },
      terminate() {},
    };
    return w;
  };
  return { create, posted };
}

const job = (kind: 'preview' | 'export', payload: unknown = 1) => ({ kind, mode: 'm', sourceId: 1, W: 8, H: 6, payload });

describe('RenderController (one whole frame per job, 009 FR-908)', () => {
  it('sends one render per job and returns the frame', async () => {
    const fake = fakeWorkerFactory();
    const c = new RenderController({ createWorker: fake.create, poolSize: 2 });
    let progress: [number, number] | null = null;
    const r = await c.submit(job('preview', 5), (d, t) => (progress = [d, t])).promise;
    expect(r.status).toBe('done');
    expect(r.pixels!.length).toBe(8 * 6 * 4);
    expect(r.pixels![0]).toBe(5);
    expect(fake.posted.filter((m) => m.type === 'render')).toHaveLength(1);
    expect(progress).toEqual([1, 1]);
  });

  it('cancels an older preview when a newer preview is submitted', async () => {
    const fake = fakeWorkerFactory({ delayMs: 5 });
    const c = new RenderController({ createWorker: fake.create, poolSize: 1 });
    const first = c.submit(job('preview', 1));
    const second = c.submit(job('preview', 2));
    expect((await first.promise).status).toBe('cancelled');
    const r = await second.promise;
    expect(r.status).toBe('done');
    expect(r.pixels![0]).toBe(2);
    expect(c.state(first.jobId)).toBe('cancelled');
  });

  it('does not cancel an export when a preview is submitted', async () => {
    const fake = fakeWorkerFactory({ delayMs: 2 });
    const c = new RenderController({ createWorker: fake.create, poolSize: 1 });
    const exp = c.submit(job('export'));
    const prev = c.submit(job('preview'));
    expect((await exp.promise).status).toBe('done');
    expect((await prev.promise).status).toBe('done');
  });

  it('cancel() ends a job and tells the workers', async () => {
    const fake = fakeWorkerFactory({ delayMs: 5 });
    const c = new RenderController({ createWorker: fake.create, poolSize: 1 });
    const j = c.submit(job('export'));
    c.cancel(j.jobId);
    const r = await j.promise;
    expect(r.status).toBe('cancelled');
    expect(r.pixels).toBeUndefined();
    expect(fake.posted.some((m) => m.type === 'cancel' && m.jobId === j.jobId)).toBe(true);
  });

  it('marks a job failed on a worker error and keeps working afterwards', async () => {
    const fake = fakeWorkerFactory({ failPayload: 9 });
    const c = new RenderController({ createWorker: fake.create, poolSize: 1 });
    const bad = await c.submit(job('preview', 9)).promise;
    expect(bad.status).toBe('failed');
    expect(bad.error).toBe('boom');
    expect((await c.submit(job('preview', 1)).promise).status).toBe('done');
  });

  it('broadcasts the source to every worker', () => {
    const fake = fakeWorkerFactory();
    const c = new RenderController({ createWorker: fake.create, poolSize: 2 });
    c.setSource(7, { width: 1, height: 1, data: new Uint8Array(3) }, null);
    expect(fake.posted.filter((m) => m.type === 'setSource' && m.sourceId === 7)).toHaveLength(2);
  });
});
