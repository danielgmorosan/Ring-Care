import { buildStrangerAlertMessage } from './stranger-alert-message';

describe('buildStrangerAlertMessage', () => {
  it('states the uniform as plain context when present, and omits it otherwise', () => {
    expect(buildStrangerAlertMessage(true)).toContain('appear to be in a uniform');
    expect(buildStrangerAlertMessage(false)).not.toContain('uniform');
  });

  it('keeps the brand voice: no dramatization, no em dashes', () => {
    for (const uniformed of [true, false]) {
      const message = buildStrangerAlertMessage(uniformed);
      expect(message).not.toContain('!');
      expect(message).not.toContain('—');
      expect(message).not.toMatch(/emergency|urgent|danger/i);
    }
  });
});
