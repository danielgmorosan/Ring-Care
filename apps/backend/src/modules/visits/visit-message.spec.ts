import { buildVisitArrivalText, buildVisitNoShowMessage } from './visit-message';

describe('visit messages', () => {
  it('logs an arrival on the household clock', () => {
    expect(buildVisitArrivalText('Anna', '2026-07-15T08:02:00.000Z', 'Europe/Lisbon')).toBe(
      'Anna arrived at 9:02.',
    );
  });

  it('tells the family plainly when a visitor has not arrived', () => {
    const text = buildVisitNoShowMessage('Anna', '2026-07-15T08:00:00.000Z', 'Europe/Lisbon');
    expect(text).toBe(
      "Anna was expected at 9:00 and hasn't arrived yet. Open the app to check in.",
    );
    expect(text).not.toMatch(/[—–!]/);
  });

  it('uses 24-hour local time for afternoon visits', () => {
    expect(buildVisitArrivalText('Nurse', '2026-01-15T15:30:00.000Z', 'Europe/Lisbon')).toBe(
      'Nurse arrived at 15:30.',
    );
  });
});
