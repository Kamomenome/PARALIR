import type { RgbImage } from '../engine/common/image/normalize';
import type { FromWorker, ToWorker } from '../worker/protocol';

/** Minimal Worker surface so tests can inject doubles and file:// can fall back to in-thread rendering. */
export interface WorkerLike {
  postMessage(msg: ToWorker, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: FromWorker }) => void) | null;
  /** A real Worker that dies (e.g. out of memory) or sends something unreadable (008 FR-805). */
  onerror?: ((ev: any) => void) | null;
  onmessageerror?: ((ev: any) => void) | null;
  terminate(): void;
}

/** The spatial worlds draw whole frames, so more workers only cost memory (each holds the photo): two at most (008 FR-804). */
export function poolSizeFor(cores: number): number {
  return Math.min(2, Math.max(1, cores - 1));
}

const CRASHED = '描画の処理が止まりました（メモリ不足の可能性があります）。もう一度操作すると描き直します';
/** Photos kept for a replacement worker: the current one and the one before, which an export may still use (008 FR-806). */
const KEPT_SOURCES = 2;

export type JobKind = 'preview' | 'export';
export type JobState = 'queued' | 'running' | 'done' | 'cancelled' | 'failed';

export interface JobRequest {
  kind: JobKind;
  /** The engine that draws it (009 FR-905). */
  mode: string;
  sourceId: number;
  W: number;
  H: number;
  payload: unknown;
}

export interface JobResult {
  jobId: number;
  status: 'done' | 'cancelled' | 'failed';
  W: number;
  H: number;
  pixels?: Uint8ClampedArray;
  error?: string;
}

interface Job {
  id: number;
  req: JobRequest;
  state: JobState;
  resolve: (r: JobResult) => void;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Hands render jobs — one whole frame each — to a small pool of workers (protocol.ts).
 * Submitting a preview cancels older previews (R12); exports are never superseded (R11).
 * Previews use all workers but one, so an export always has a worker (008 FR-804); a worker that dies is replaced (FR-805).
 */
export class RenderController {
  private workers: WorkerLike[] = [];
  private idle: WorkerLike[] = [];
  private jobs = new Map<number, Job>();
  private nextId = 1;
  private createWorker: () => WorkerLike;
  private sources: { sourceId: number; img: RgbImage; features: unknown }[] = [];
  private finished = new Map<number, JobState>();
  private busy = new Map<WorkerLike, { jobId: number; kind: JobKind }>();

  constructor(opts: { createWorker: () => WorkerLike; poolSize: number }) {
    this.createWorker = opts.createWorker;
    for (let i = 0; i < Math.max(1, opts.poolSize); i++) {
      const w = this.spawn();
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  private spawn(): WorkerLike {
    const w = this.createWorker();
    w.onmessage = (ev) => this.onMessage(w, ev.data);
    w.onerror = () => this.crashed(w);
    w.onmessageerror = () => this.crashed(w);
    for (const s of this.sources) w.postMessage({ type: 'setSource', ...s });
    return w;
  }

  /** Fails the dead worker's job with a reason and puts a fresh worker, with the photos, in its place. */
  private crashed(w: WorkerLike): void {
    const i = this.workers.indexOf(w);
    if (i < 0) return;
    const job = this.jobs.get(this.busy.get(w)?.jobId ?? -1);
    this.busy.delete(w);
    this.idle = this.idle.filter((x) => x !== w);
    try {
      w.terminate();
    } catch {
      // already gone
    }
    if (job) this.finish(job, 'failed', { error: CRASHED });
    const fresh = this.spawn();
    this.workers[i] = fresh;
    this.idle.push(fresh);
    this.pump();
  }

  setSource(sourceId: number, img: RgbImage, features: unknown): void {
    this.sources = [...this.sources.filter((s) => s.sourceId !== sourceId), { sourceId, img, features }].slice(-KEPT_SOURCES);
    for (const w of this.workers) w.postMessage({ type: 'setSource', sourceId, img, features });
  }

  submit(req: JobRequest, onProgress?: (done: number, total: number) => void): { jobId: number; promise: Promise<JobResult> } {
    if (req.kind === 'preview') {
      for (const j of this.jobs.values()) if (j.req.kind === 'preview') this.finish(j, 'cancelled');
    }
    const id = this.nextId++;
    let resolve!: (r: JobResult) => void;
    const promise = new Promise<JobResult>((res) => (resolve = res));
    this.jobs.set(id, { id, req, state: 'queued', resolve, onProgress });
    this.pump();
    return { jobId: id, promise };
  }

  cancel(jobId: number): void {
    const j = this.jobs.get(jobId);
    if (!j) return;
    for (const w of this.workers) w.postMessage({ type: 'cancel', jobId });
    this.finish(j, 'cancelled');
  }

  state(jobId: number): JobState | undefined {
    return this.finished.get(jobId) ?? this.jobs.get(jobId)?.state;
  }

  get poolSize(): number {
    return this.workers.length;
  }

  dispose(): void {
    for (const j of this.jobs.values()) this.finish(j, 'cancelled');
    for (const w of this.workers) w.terminate();
  }

  private finish(j: Job, status: 'done' | 'cancelled' | 'failed', extra: { error?: string; pixels?: Uint8ClampedArray } = {}): void {
    if (!this.jobs.has(j.id)) return;
    this.jobs.delete(j.id);
    j.state = status;
    this.finished.set(j.id, status);
    // Only recent states are asked for; keep the map small.
    if (this.finished.size > 256) this.finished.delete(this.finished.keys().next().value!);
    j.resolve({ jobId: j.id, status, W: j.req.W, H: j.req.H, ...extra });
  }

  /** Previews first, then exports, oldest first within a kind; previews only while a worker is left for exports. */
  private next(previewAllowed: boolean): Job | undefined {
    const queued = [...this.jobs.values()].filter((j) => j.state === 'queued' && (previewAllowed || j.req.kind !== 'preview'));
    return queued.sort((a, b) => (a.req.kind === b.req.kind ? a.id - b.id : a.req.kind === 'preview' ? -1 : 1))[0];
  }

  private pump(): void {
    const previewSlots = Math.max(1, this.workers.length - 1);
    while (this.idle.length > 0) {
      // Superseded previews still occupy their worker until they finish, so count by kind, not by live job.
      const previewBusy = [...this.busy.values()].filter((b) => b.kind === 'preview').length;
      const job = this.next(previewBusy < previewSlots);
      if (!job) return;
      const w = this.idle.shift()!;
      job.state = 'running';
      this.busy.set(w, { jobId: job.id, kind: job.req.kind });
      const { mode, sourceId, payload, W, H } = job.req;
      w.postMessage({ type: 'render', jobId: job.id, sourceId, mode, payload, W, H });
    }
  }

  private onMessage(w: WorkerLike, msg: FromWorker): void {
    if (!this.workers.includes(w) || msg.type === 'pong') return;
    this.busy.delete(w);
    this.idle.push(w);
    const job = this.jobs.get(msg.jobId);
    if (job) {
      if (msg.type === 'error') this.finish(job, 'failed', { error: String(msg.message) });
      else {
        job.onProgress?.(1, 1);
        this.finish(job, 'done', { pixels: msg.pixels });
      }
    }
    this.pump();
  }
}
