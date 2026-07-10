import { buildWanderMessage } from './wander-message';

describe('buildWanderMessage', () => {
  it('names the door and says plainly that they have not returned', () => {
    expect(buildWanderMessage('Front door')).toBe(
      'Someone left through the Front door and has not come back. Open the app to take a look.',
    );
  });

  it('keeps the brand voice: no dramatization, no em dashes', () => {
    const message = buildWanderMessage('back gate');
    expect(message).not.toContain('!');
    expect(message).not.toContain('—');
    expect(message).not.toMatch(/emergency|urgent|danger|warning/i);
  });
});
