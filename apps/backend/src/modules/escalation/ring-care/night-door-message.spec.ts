import {
  buildNightDoorAlertMessage,
  buildNightDoorMessage,
  buildNightDoorUnansweredMessage,
} from './night-door-message';

const AT = '2026-07-15T02:04:00.000Z'; // 03:04 in Lisbon (summer time)
const TZ = 'Europe/Lisbon';

describe('night door messages', () => {
  it('names the time on the household clock and who we are calling', () => {
    expect(buildNightDoorMessage('motion', AT, TZ, 'Sofia')).toBe(
      "Someone was at the front door at 3:04. We're calling Sofia now.",
    );
    expect(buildNightDoorMessage('ding', AT, TZ, 'Sofia')).toBe(
      "Someone rang the front doorbell at 3:04. We're calling Sofia now.",
    );
  });

  it('points to the app when nobody can be called', () => {
    expect(buildNightDoorMessage('motion', AT, TZ, null)).toBe(
      'Someone was at the front door at 3:04. Open the app to take a look.',
    );
    expect(buildNightDoorAlertMessage('motion', AT, TZ)).toBe(
      'Someone was at the front door at 3:04. Open the app to take a look.',
    );
  });

  it('asks the whole chain to check on home when nobody picked up', () => {
    expect(buildNightDoorUnansweredMessage('motion', AT, TZ)).toBe(
      "Someone was at the front door at 3:04. We haven't reached anyone by phone yet. Please check on home.",
    );
  });

  it('keeps the brand voice: no em dashes, no exclamation marks, no capitals shouting', () => {
    const all = [
      buildNightDoorMessage('motion', AT, TZ, 'Sofia'),
      buildNightDoorMessage('ding', AT, TZ, null),
      buildNightDoorUnansweredMessage('ding', AT, TZ),
      buildNightDoorAlertMessage('ding', AT, TZ),
    ];
    for (const text of all) {
      expect(text).not.toMatch(/[—–!]/);
      expect(text).not.toMatch(/EMERGENCY|URGENT/);
    }
  });
});
