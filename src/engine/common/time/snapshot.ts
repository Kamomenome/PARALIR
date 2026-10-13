import { Temporal } from 'temporal-polyfill';

/** The artwork time used as seed input (data-model.md). */
export interface TimeSnapshot {
  /** UTC epoch milliseconds as a decimal integer string. */
  instantEpochMs: string;
  /** YYYY-MM-DDTHH:mm:ss.SSS, the resolved wall-clock time. */
  localDateTime: string;
  timeZone: string;
  offsetMinutes: number;
  /** Display only; not part of the seed input. */
  resolution: 'exact' | 'gap' | 'ambiguous';
}

function toSnapshot(z: Temporal.ZonedDateTime, resolution: TimeSnapshot['resolution']): TimeSnapshot {
  return {
    instantEpochMs: String(z.epochMilliseconds),
    localDateTime: z.toPlainDateTime().toString({ fractionalSecondDigits: 3 }),
    timeZone: z.timeZoneId,
    offsetMinutes: Math.round(z.offsetNanoseconds / 60_000_000_000),
    resolution,
  };
}

/** Resolve a wall-clock time in a zone ("compatible": gaps move forward, overlaps take the earlier). */
export function snapshotFromLocal(local: string, timeZone: string): TimeSnapshot {
  const pdt = Temporal.PlainDateTime.from(local, { overflow: 'reject' });
  const zdt = pdt.toZonedDateTime(timeZone, { disambiguation: 'compatible' });
  const earlier = pdt.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
  const later = pdt.toZonedDateTime(timeZone, { disambiguation: 'later' });
  let resolution: TimeSnapshot['resolution'] = 'exact';
  if (earlier.epochNanoseconds !== later.epochNanoseconds) {
    resolution = Temporal.PlainDateTime.compare(zdt.toPlainDateTime(), pdt) === 0 ? 'ambiguous' : 'gap';
  }
  return toSnapshot(zdt, resolution);
}

/** Snapshot of a given instant; the caller supplies "now" so rendering never reads the clock. */
export function snapshotNow(nowMs: number, timeZone: string): TimeSnapshot {
  return toSnapshot(Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(timeZone), 'exact');
}

export function systemTimeZone(): string {
  return Temporal.Now.timeZoneId();
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const m = Math.abs(minutes);
  return `${sign}${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
