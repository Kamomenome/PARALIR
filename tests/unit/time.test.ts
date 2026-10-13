import { describe, expect, it } from 'vitest';
import { snapshotFromLocal, snapshotNow } from '../../src/engine/common/time/snapshot';

describe('TimeSnapshot', () => {
  it('uses fixed-width local time and a decimal integer instant', () => {
    const s = snapshotFromLocal('2026-10-11T09:05:07.008', 'Asia/Tokyo');
    expect(s).toEqual({
      instantEpochMs: String(Date.UTC(2026, 9, 11, 0, 5, 7, 8)),
      localDateTime: '2026-10-11T09:05:07.008',
      timeZone: 'Asia/Tokyo',
      offsetMinutes: 540,
      resolution: 'exact',
    });
  });

  it('pads missing seconds and milliseconds', () => {
    expect(snapshotFromLocal('2026-01-02T03:04', 'UTC').localDateTime).toBe('2026-01-02T03:04:00.000');
  });

  it('resolves a skipped local time (DST gap) forward and records it', () => {
    const s = snapshotFromLocal('2026-03-08T02:30', 'America/New_York');
    expect(s.resolution).toBe('gap');
    expect(s.localDateTime).toBe('2026-03-08T03:30:00.000');
    expect(s.offsetMinutes).toBe(-240);
    expect(s.instantEpochMs).toBe(String(Date.UTC(2026, 2, 8, 7, 30)));
  });

  it('resolves a repeated local time (DST overlap) to the earlier instant and records it', () => {
    const s = snapshotFromLocal('2026-11-01T01:30', 'America/New_York');
    expect(s.resolution).toBe('ambiguous');
    expect(s.localDateTime).toBe('2026-11-01T01:30:00.000');
    expect(s.offsetMinutes).toBe(-240);
    expect(s.instantEpochMs).toBe(String(Date.UTC(2026, 10, 1, 5, 30)));
  });

  it('snapshotNow uses only the given instant', () => {
    const ms = Date.UTC(2026, 9, 11, 3, 0, 0, 123);
    expect(snapshotNow(ms, 'Asia/Tokyo')).toEqual({
      instantEpochMs: String(ms),
      localDateTime: '2026-10-11T12:00:00.123',
      timeZone: 'Asia/Tokyo',
      offsetMinutes: 540,
      resolution: 'exact',
    });
  });

  it('rejects malformed input', () => {
    expect(() => snapshotFromLocal('not a date', 'Asia/Tokyo')).toThrow();
    expect(() => snapshotFromLocal('2026-10-11T00:00', 'Not/AZone')).toThrow();
  });
});
