import {
  CHECKIN_WAIT_SECONDS,
  DEFAULT_ESCALATION_RULES,
  NIGHT_DOOR_REASON,
  escalationRulesFor,
  shouldSkipForQuietHours,
  withinWindow,
  type EscalationContact,
} from './types';

describe('withinWindow', () => {
  it('handles a same-day window [09:00, 17:00)', () => {
    expect(withinWindow('09:00', '17:00', 8 * 60)).toBe(false);
    expect(withinWindow('09:00', '17:00', 9 * 60)).toBe(true);
    expect(withinWindow('09:00', '17:00', 16 * 60)).toBe(true);
    expect(withinWindow('09:00', '17:00', 17 * 60)).toBe(false);
  });

  it('handles a window that wraps past midnight [22:00, 07:00)', () => {
    expect(withinWindow('22:00', '07:00', 23 * 60)).toBe(true);
    expect(withinWindow('22:00', '07:00', 3 * 60)).toBe(true);
    expect(withinWindow('22:00', '07:00', 12 * 60)).toBe(false);
    expect(withinWindow('22:00', '07:00', 7 * 60)).toBe(false);
  });

  it('treats an empty or malformed window as not matching', () => {
    expect(withinWindow('08:00', '08:00', 8 * 60)).toBe(false);
    expect(withinWindow('bad', '07:00', 100)).toBe(false);
  });
});

describe('shouldSkipForQuietHours', () => {
  const contact = (quietHours: EscalationContact['quietHours']): EscalationContact => ({
    id: 'c1',
    name: 'Ana',
    role: 'daughter',
    phone: '+351900000000',
    pushToken: null,
    priority: 0,
    quietHours,
  });

  const nightNow = 23 * 60; // 23:00

  it('never skips a contact without quiet hours', () => {
    expect(shouldSkipForQuietHours(contact(null), false, nightNow)).toBe(false);
  });

  it('skips inside quiet hours when it is not a confirmed fall', () => {
    const c = contact({ start: '22:00', end: '07:00', wakeForConfirmedFallOnly: true });
    expect(shouldSkipForQuietHours(c, false, nightNow)).toBe(true);
  });

  it('wakes the contact for a confirmed fall despite quiet hours', () => {
    const c = contact({ start: '22:00', end: '07:00', wakeForConfirmedFallOnly: true });
    expect(shouldSkipForQuietHours(c, true, nightNow)).toBe(false);
  });

  it('does not skip outside the quiet window', () => {
    const c = contact({ start: '22:00', end: '07:00', wakeForConfirmedFallOnly: true });
    expect(shouldSkipForQuietHours(c, false, 12 * 60)).toBe(false);
  });
});

describe('latency budget', () => {
  it('keeps the voice check-in wait within the 30s detection-to-ring budget', () => {
    // The check-in gate must leave headroom under the 30s budget from detection to
    // the first family phone ringing.
    expect(CHECKIN_WAIT_SECONDS).toBeLessThan(30);
  });
});

describe('escalationRulesFor', () => {
  it('runs the full fall ladder for falls and anything unlisted', () => {
    for (const reason of ['fall.suspected', 'fall.confirmed', 'canary.fall', 'unknown']) {
      expect(escalationRulesFor(reason)).toBe(DEFAULT_ESCALATION_RULES);
    }
    expect(DEFAULT_ESCALATION_RULES).toEqual({
      voiceCheckin: true,
      emergencyServices: true,
      wakesThroughQuietHours: false,
    });
  });

  it('runs door.night_activity family-only: no check-in gate, never emergency services (0011)', () => {
    expect(escalationRulesFor(NIGHT_DOOR_REASON)).toEqual({
      voiceCheckin: false,
      emergencyServices: false,
      wakesThroughQuietHours: true,
    });
  });

  it('is not fooled by prototype keys', () => {
    expect(escalationRulesFor('constructor')).toBe(DEFAULT_ESCALATION_RULES);
  });

  it('rule sets are frozen so nothing can switch 112 back on at runtime', () => {
    expect(Object.isFrozen(escalationRulesFor(NIGHT_DOOR_REASON))).toBe(true);
    expect(Object.isFrozen(DEFAULT_ESCALATION_RULES)).toBe(true);
  });
});
