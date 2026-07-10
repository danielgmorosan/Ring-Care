import { buildDoorCrossingMessage, buildZoneAlertMessage } from './zone-alert-message';

describe('buildZoneAlertMessage', () => {
  it('names the zone the family named', () => {
    expect(buildZoneAlertMessage('Stove')).toBe(
      'Someone is in the Stove. Open the app to take a look.',
    );
  });

  it('keeps the brand voice: no dramatization, no em dashes', () => {
    const message = buildZoneAlertMessage('top of the stairs');
    expect(message).not.toContain('!');
    expect(message).not.toContain('—');
    expect(message).not.toMatch(/emergency|urgent|danger|warning/i);
  });
});

describe('buildDoorCrossingMessage', () => {
  it('names the door and states plainly that it is late', () => {
    expect(buildDoorCrossingMessage('Front door')).toBe(
      'Someone is at the Front door, and it is late. Open the app to take a look.',
    );
  });

  it('keeps the brand voice: no dramatization, no em dashes', () => {
    const message = buildDoorCrossingMessage('Front door');
    expect(message).not.toContain('!');
    expect(message).not.toContain('—');
    expect(message).not.toMatch(/emergency|urgent|danger|warning/i);
  });
});
