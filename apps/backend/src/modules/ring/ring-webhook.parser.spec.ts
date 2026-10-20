import { fixture } from './fixtures/load-fixture';
import { parseRingWebhook } from './ring-webhook.parser';

describe('parseRingWebhook', () => {
  it('reads a JSON:API motion event with a Smart Alert label, ignoring media URLs', () => {
    const parsed = parseRingWebhook(fixture('motion-human.jsonapi'));
    expect(parsed).toEqual({
      eventKey: 'ring:evt_01JAMOTIONHUMAN0001',
      rawType: 'motion_detected',
      kind: 'motion',
      ringDeviceId: 'ring-dev-front-1',
      subType: 'human',
      occurredAt: '2026-10-21T02:04:00.000Z',
    });
    expect(JSON.stringify(parsed)).not.toContain('snapshot');
  });

  it('reads a flat doorbell press', () => {
    expect(parseRingWebhook(fixture('button-press.flat'))).toMatchObject({
      eventKey: 'ring:evt_01JABUTTONPRESS0001',
      kind: 'ding',
      ringDeviceId: 'ring-dev-front-1',
      subType: null,
      occurredAt: '2026-10-21T08:02:00.000Z',
    });
  });

  it('reads epoch-second timestamps and offline events', () => {
    expect(parseRingWebhook(fixture('device-offline'))).toMatchObject({
      kind: 'offline',
      occurredAt: new Date(1792540800 * 1000).toISOString(),
    });
  });

  it('prefers a known event type in attributes over the JSON:API resource type', () => {
    expect(parseRingWebhook(fixture('device-online'))).toMatchObject({
      kind: 'online',
      rawType: 'device_online',
      eventKey: 'ring:evt_01JADEVICEONLINE001',
    });
  });

  it('keeps an unknown event type verbatim as kind other', () => {
    expect(parseRingWebhook(fixture('unknown-type'))).toMatchObject({
      kind: 'other',
      rawType: 'battery_low',
    });
  });

  it('derives a stable key from the body when Ring sends no event id', () => {
    const a = parseRingWebhook(fixture('motion-no-id'));
    const b = parseRingWebhook(fixture('motion-no-id'));
    expect(a.eventKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.eventKey).toBe(b.eventKey);
    expect(a).toMatchObject({ kind: 'motion', subType: 'vehicle', occurredAt: null });
  });

  it('throws on a body that is not a JSON object', () => {
    expect(() => parseRingWebhook(Buffer.from('[1,2]'))).toThrow();
    expect(() => parseRingWebhook(Buffer.from('not json'))).toThrow();
  });
});
