import {
  dayInZone,
  hourInZone,
  isValidTimeZone,
  minutesSinceMidnightInZone,
  normalizeTimeZone,
} from './timezone';

describe('timezone helpers', () => {
  it('validates IANA zones', () => {
    expect(isValidTimeZone('Europe/Lisbon')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('normalizes anything missing or invalid to UTC', () => {
    expect(normalizeTimeZone('Europe/Lisbon')).toBe('Europe/Lisbon');
    expect(normalizeTimeZone('Not/AZone')).toBe('UTC');
    expect(normalizeTimeZone(null)).toBe('UTC');
    expect(normalizeTimeZone(undefined)).toBe('UTC');
  });

  it('computes the local calendar day of an instant', () => {
    // 22:00 UTC on the 8th is the 8th in UTC but already the 9th in Auckland (+12).
    const instant = '2026-07-08T22:00:00.000Z';
    expect(dayInZone(instant, 'UTC')).toBe('2026-07-08');
    expect(dayInZone(instant, 'Pacific/Auckland')).toBe('2026-07-09');
    // ...and still the 8th (early evening) in Lisbon.
    expect(dayInZone(instant, 'Europe/Lisbon')).toBe('2026-07-08');
  });

  it('computes the local hour-of-day of an instant', () => {
    const instant = '2026-07-09T03:00:00.000Z';
    expect(hourInZone(instant, 'UTC')).toBe(3);
    // 03:00Z is noon in Tokyo (+9) and 13:00 in Lisbon (summer, +1... DST-aware).
    expect(hourInZone(instant, 'Asia/Tokyo')).toBe(12);
    // Midnight normalizes to 0, never 24.
    expect(hourInZone('2026-07-09T00:00:00.000Z', 'UTC')).toBe(0);
  });

  it('computes minutes since local midnight', () => {
    const instant = '2026-07-10T00:30:00.000Z';
    expect(minutesSinceMidnightInZone(instant, 'UTC')).toBe(30);
    // 00:30Z is 09:30 in Tokyo (+9) → 9*60 + 30.
    expect(minutesSinceMidnightInZone(instant, 'Asia/Tokyo')).toBe(570);
    // Local midnight is 0, never 1440.
    expect(minutesSinceMidnightInZone('2026-07-10T00:00:00.000Z', 'UTC')).toBe(0);
  });
});
