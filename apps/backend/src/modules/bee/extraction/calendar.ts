import { dayInZone } from '../../families/timezone';

/**
 * Calendar-date arithmetic for resolving "from Monday" and "in two weeks" against the
 * time of the caregiver's note, in the family's timezone. Dates are plain YYYY-MM-DD
 * strings (no instant) until the very end, when a wall-clock time in the family's zone
 * is converted to a UTC instant.
 */

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** The local calendar day of an instant in `tz`. */
export function localDate(instant: string | Date, tz: string): string {
  return dayInZone(instant, tz);
}

function utcNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

export function addDays(ymd: string, days: number): string {
  const d = utcNoon(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(ymd: string, months: number): string {
  const d = utcNoon(ymd);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(ymd: string): number {
  return utcNoon(ymd).getUTCDay();
}

/** The next given weekday strictly after `ymd` ("from Monday" said on a Monday = next week). */
export function nextWeekday(ymd: string, weekday: number): string {
  const diff = (weekday - weekdayOf(ymd) + 7) % 7 || 7;
  return addDays(ymd, diff);
}

/** Offset of `tz` from UTC at `instant`, in minutes. */
function offsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** The UTC instant (ISO) of wall-clock `hhmm` on `ymd` in `tz`. */
export function zonedTimeToUtc(ymd: string, hhmm: string, tz: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const [y, mo, d] = ymd.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, m);
  // Two passes settle the offset across DST transitions.
  let guess = naive - offsetMinutes(new Date(naive), tz) * 60000;
  guess = naive - offsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess).toISOString();
}

/** "Monday 26 October", for titles the caregiver reads. */
export function humanDate(ymd: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(utcNoon(ymd));
}
