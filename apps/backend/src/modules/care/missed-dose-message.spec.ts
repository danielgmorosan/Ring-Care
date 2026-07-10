import { buildMissedDoseMessage } from './missed-dose-message';

describe('buildMissedDoseMessage', () => {
  it('names the medication and the time, and prompts a check-in', () => {
    expect(buildMissedDoseMessage('Bisoprolol', '08:00')).toBe(
      'The 08:00 dose of Bisoprolol has not been confirmed. Open the app to check in.',
    );
  });

  it('keeps the brand voice: no dramatization, no em dashes, no diagnosis', () => {
    const message = buildMissedDoseMessage('Warfarin', '20:00');
    expect(message).not.toContain('!');
    expect(message).not.toContain('—');
    expect(message).not.toMatch(/emergency|urgent|danger|overdose/i);
  });
});
