import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, prepareSource, withPhoto, withSource } from '../../src/app/state';
import { snapshotNow } from '../../src/engine/common/time/snapshot';
import { BUSY_TEXT, createBusy } from '../../src/ui/busy';
import { makeScene } from '../helpers/images';

describe('what is being done is shown, after a short delay (012 FR-1201, FR-1202)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows nothing for work under 0.15 s', () => {
    const shown: (string | null)[] = [];
    const busy = createBusy((t) => shown.push(t));
    const end = busy.start('draw');
    vi.advanceTimersByTime(100);
    end();
    vi.advanceTimersByTime(500);
    expect(shown.filter(Boolean)).toEqual([]);
  });

  it('shows the first reason: loading, then the AI, then drawing; and nothing once all ended', () => {
    const shown: (string | null)[] = [];
    const busy = createBusy((t) => shown.push(t));
    const draw = busy.start('draw');
    const ai = busy.start('ai');
    vi.advanceTimersByTime(200);
    expect(shown.at(-1)).toBe(BUSY_TEXT.ai);
    const load = busy.start('load');
    expect(shown.at(-1)).toBe(BUSY_TEXT.load);
    load();
    expect(shown.at(-1)).toBe(BUSY_TEXT.ai);
    ai();
    expect(shown.at(-1)).toBe(BUSY_TEXT.draw);
    draw();
    expect(shown.at(-1)).toBeNull();
    expect(BUSY_TEXT).toEqual({ load: '写真を読み込んでいます…', ai: 'AI が写真を見ています…', draw: '描いています…' });
  });
});

describe('a photo is shown before the AI and the world are ready (012 FR-1203)', () => {
  it('withPhoto puts the photo in without a world; withSource then composes it', async () => {
    const src = await prepareSource(1, { name: 'scene.png', img: makeScene(64, 48), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
    const s0 = createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo');
    const s = withPhoto(s0, src);
    expect(s.source).toBe(src);
    expect(s.showing).toBe('photo');
    expect(s.spaceWorld).toBeNull();
    const t = await withSource(s, src);
    expect(t.spaceWorld).not.toBeNull();
    expect(t.showing).toBe('photo');
  });

  it('the artwork time is when the photo goes in (016 FR-1601)', async () => {
    const src = await prepareSource(1, { name: 'scene.png', img: makeScene(64, 48), fileSha256: 'a'.repeat(64) as any, fileBytes: 100, hadTransparency: false });
    const opened = createInitialState(Date.UTC(2026, 9, 11, 3), 'Asia/Tokyo');
    const now = snapshotNow(Date.UTC(2026, 9, 11, 5, 30), 'Asia/Tokyo');
    expect(withPhoto(opened, src, now).time).toEqual(now);
  });
});
