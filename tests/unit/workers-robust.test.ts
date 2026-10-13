import { afterEach, describe, expect, it } from 'vitest';
import { RenderController, poolSizeFor, type WorkerLike } from '../../src/app/controller';
import { partsFor, prepareSource, usePartsProvider } from '../../src/app/state';
import { createHandler } from '../../src/worker/handler';
import { registerRenderer } from '../../src/worker/renderers';
import { makeScene } from '../helpers/images';

/** A worker double that answers renders after `delay` ms, unless told to crash. */
function workers(delay = 5) {
  const made: (WorkerLike & { posted: any[]; crash(): void; terminated: boolean })[] = [];
  const create = (): WorkerLike => {
    const w: any = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      posted: [] as any[],
      terminated: false,
      postMessage(msg: any) {
        w.posted.push(msg);
        if (msg.type !== 'render') return;
        setTimeout(() => {
          if (w.terminated) return;
          const pixels = new Uint8ClampedArray(msg.W * msg.H * 4).fill(1);
          w.onmessage?.({ data: { type: 'frame', jobId: msg.jobId, pixels } });
        }, delay);
      },
      terminate() {
        w.terminated = true;
      },
      crash() {
        w.terminated = true;
        w.onerror?.({ message: 'out of memory' });
      },
    };
    made.push(w);
    return w;
  };
  return { create, made };
}

const job = (kind: 'preview' | 'export', sourceId = 1) => ({ kind, mode: 'm', sourceId, W: 4, H: 4, payload: null });

describe('render workers (008 FR-804〜FR-806, SC-803)', () => {
  it('two workers at most, whatever the number of cores; one at least', () => {
    expect(poolSizeFor(16)).toBe(2);
    expect(poolSizeFor(3)).toBe(2);
    expect(poolSizeFor(2)).toBe(1);
    expect(poolSizeFor(1)).toBe(1);
  });

  it('previews use one worker at most, so an export can always start', async () => {
    const ws = workers(30);
    const c = new RenderController({ createWorker: ws.create, poolSize: 2 });
    // Superseded previews keep their worker busy until they finish.
    c.submit(job('preview'));
    c.submit(job('preview'));
    const exp = c.submit(job('export'));
    const renders = (i: number) => ws.made[i].posted.filter((m) => m.type === 'render');
    expect(renders(0).length + renders(1).length).toBe(2);
    expect([...renders(0), ...renders(1)].filter((m) => m.jobId === exp.jobId)).toHaveLength(1);
    expect((await exp.promise).status).toBe('done');
  });

  it('a crashed worker fails its job with a reason, is replaced, gets the photos again, and the next job draws', async () => {
    const ws = workers(20);
    const c = new RenderController({ createWorker: ws.create, poolSize: 1 });
    const img = { width: 1, height: 1, data: new Uint8Array(3) };
    c.setSource(1, img, null);
    c.setSource(2, img, null);
    const first = c.submit(job('preview', 2));
    ws.made[0].crash();
    const r = await first.promise;
    expect(r.status).toBe('failed');
    expect(r.error).toContain('描画の処理が止まりました');
    expect(c.poolSize).toBe(1);
    expect(ws.made).toHaveLength(2);
    expect(ws.made[1].posted.filter((m) => m.type === 'setSource').map((m) => m.sourceId)).toEqual([1, 2]);
    expect((await c.submit(job('preview', 2)).promise).status).toBe('done');
  });

  it('a message that cannot be read counts as a crash too', async () => {
    const ws = workers(20);
    const c = new RenderController({ createWorker: ws.create, poolSize: 1 });
    const first = c.submit(job('export'));
    (ws.made[0] as any).onmessageerror?.({});
    expect((await first.promise).status).toBe('failed');
    expect(ws.made).toHaveLength(2);
  });

  it('the controller remembers two photos at most for a new worker', async () => {
    const ws = workers(20);
    const c = new RenderController({ createWorker: ws.create, poolSize: 1 });
    const img = { width: 1, height: 1, data: new Uint8Array(3) };
    for (const id of [1, 2, 3]) c.setSource(id, img, null);
    ws.made[0].crash();
    expect(ws.made[1].posted.filter((m) => m.type === 'setSource').map((m) => m.sourceId)).toEqual([2, 3]);
  });

  it('a worker keeps two photos, so the previous photo can still be exported after a new one comes', () => {
    registerRenderer('test-fill', ({ W, H }) => new Uint8ClampedArray(W * H * 4).fill(7));
    const posted: any[] = [];
    const handle = createHandler((m) => posted.push(m));
    const img = { width: 1, height: 1, data: new Uint8Array(3) };
    handle({ type: 'setSource', sourceId: 1, img, features: null });
    handle({ type: 'setSource', sourceId: 2, img, features: null });
    handle({ type: 'render', jobId: 1, sourceId: 1, mode: 'test-fill', payload: null, W: 1, H: 1 });
    handle({ type: 'setSource', sourceId: 3, img, features: null });
    handle({ type: 'render', jobId: 2, sourceId: 1, mode: 'test-fill', payload: null, W: 1, H: 1 });
    expect(posted.map((m) => m.type)).toEqual(['frame', 'error']);
  });
});

describe('the AI parts have a time limit (008 FR-807, SC-803)', () => {
  afterEach(() => usePartsProvider(null));

  it('an AI that never answers becomes "no AI" with a reason, and the photo goes on without it', async () => {
    usePartsProvider(() => new Promise(() => {}), { timeoutMs: 30 });
    const src = await prepareSource(1, { name: 'a.png', img: makeScene(16, 12), fileSha256: 'a'.repeat(64) as any, fileBytes: 1, hadTransparency: false });
    const r = await partsFor(src);
    expect(r.status).toBe('failed');
    if (r.status !== 'ok') expect(r.reason).toBe('AI が時間内に終わりませんでした（推定で描画）');
    // Remembered for this photo: the next action does not wait again.
    const t0 = Date.now();
    await partsFor(src);
    expect(Date.now() - t0).toBeLessThan(20);
  });
});
