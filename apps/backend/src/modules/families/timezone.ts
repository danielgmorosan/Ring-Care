/**
 * IANA timezone helpers. "Today" for the daily summary and care view is the elder's
 * local calendar day, computed here so both features agree. Side-effect free.
 */

/** True if `tz` is an IANA zone Node's Intl accepts (e.g. "Europe/Lisbon"). */
export function isValidTimeZone(tz: string): boolean {
  try {
    // Throws RangeError for an unknown timezone.
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A trusted timezone, falling back to UTC for anything missing or invalid. */
export function normalizeTimeZone(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : 'UTC';
}

/** The YYYY-MM-DD calendar day of an instant in the given timezone. */
export function dayInZone(instant: string | Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(instant));
}

/** The local hour-of-day (0–23) of an instant in the given timezone. */
export function hourInZone(instant: string | Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instant));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  // Some environments render midnight as "24"; normalize it to 0.
  return hour === 24 ? 0 : hour;
}

/**
 * Minutes since local midnight (0–1439) of an instant in the given timezone. Lets the
 * missed-dose sweep compare "now" against an "HH:MM" schedule slot in local terms,
 * without constructing a wall-clock-to-UTC instant (which is timezone-hazardous).
 */
export function minutesSinceMidnightInZone(instant: string | Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instant));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}
