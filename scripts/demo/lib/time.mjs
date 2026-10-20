// Household-local clock times without touching the process time zone. The demo machine
// may be on any zone (a Windows PC in Lisbon, a laptop on UTC); the household is the
// family's timezone from the backend. Pure: `now` is passed in.

function parts(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Offset of `timeZone` from UTC at instant `ms`, in ms (Lisbon summer: +3600000). */
function offsetAt(ms, timeZone) {
  const p = parts(ms, timeZone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant of a wall-clock time in a zone (DST-safe to the hour). */
export function zonedInstant(y, mo, d, hh, mm, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  let ms = guess - offsetAt(guess, timeZone);
  ms = guess - offsetAt(ms, timeZone);
  return ms;
}

/** The most recent past hh:mm in the zone: today's, or yesterday's if still ahead. */
export function lastLocal(hh, mm, timeZone, nowMs) {
  const p = parts(nowMs, timeZone);
  let ms = zonedInstant(p.y, p.mo, p.d, hh, mm, timeZone);
  if (ms > nowMs) {
    const prev = parts(nowMs - 86_400_000, timeZone);
    ms = zonedInstant(prev.y, prev.mo, prev.d, hh, mm, timeZone);
  }
  return ms;
}

/** Same as ring-sim's now-night: the last 03:04 local plus the current seconds and ms. */
export function nowNight(timeZone, nowMs) {
  const base = lastLocal(3, 4, timeZone, nowMs);
  return base + (Math.floor(nowMs / 1000) % 60) * 1000 + (nowMs % 1000);
}

/** "15:42" in the zone, for printing what the family app will show. */
export function localClock(ms, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}
