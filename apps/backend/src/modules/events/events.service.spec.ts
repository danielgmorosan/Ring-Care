import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventType, type EventEnvelope } from '@obrigada/shared';
import {
  InternalEvent,
  type FallDetectedPayload,
  type PersonUnknownPayload,
  type VoiceCheckinReportedPayload,
  type ZoneEnteredPayload,
  type ZoneExitedPayload,
} from '../../internal-events/internal-events';
import { EventsService } from './events.service';
import { InMemoryEventStreamRepository } from './in-memory-event-stream.repository';

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: '11111111-1111-4111-8111-111111111111',
    deviceId: 'dev-1',
    type: EventType.FallConfirmed,
    occurredAt: '2026-07-06T18:00:00.000Z',
    confidence: 0.97,
    payload: {},
    ...overrides,
  } as EventEnvelope;
}

describe('EventsService', () => {
  let events: EventsService;
  let bus: EventEmitter2;
  let emit: jest.SpyInstance;

  beforeEach(() => {
    bus = new EventEmitter2();
    emit = jest.spyOn(bus, 'emit');
    events = new EventsService(new InMemoryEventStreamRepository(), bus);
  });

  it('emits FallDetected when a confirmed fall is newly ingested', async () => {
    await events.ingest(envelope());

    const fallEmits = emit.mock.calls.filter((c) => c[0] === InternalEvent.FallDetected);
    expect(fallEmits).toHaveLength(1);
    const payload = fallEmits[0]![1] as FallDetectedPayload;
    expect(payload).toEqual({
      deviceId: 'dev-1',
      eventId: '11111111-1111-4111-8111-111111111111',
      type: EventType.FallConfirmed,
      occurredAt: '2026-07-06T18:00:00.000Z',
    });
  });

  it('also emits FallDetected for a suspected fall (the check-in-gated tier)', async () => {
    await events.ingest(
      envelope({ type: EventType.FallSuspected, eventId: '22222222-2222-4222-8222-222222222222' }),
    );
    const fallEmits = emit.mock.calls.filter((c) => c[0] === InternalEvent.FallDetected);
    expect(fallEmits).toHaveLength(1);
    expect((fallEmits[0]![1] as FallDetectedPayload).type).toBe(EventType.FallSuspected);
  });

  it('does not emit for a non-fall event', async () => {
    await events.ingest(envelope({ type: EventType.Heartbeat }));
    expect(emit.mock.calls.some((c) => c[0] === InternalEvent.FallDetected)).toBe(false);
  });

  it('emits PersonUnknown with the uniform flag when an unknown person is ingested', async () => {
    await events.ingest(
      envelope({
        type: EventType.PersonUnknown,
        eventId: '33333333-3333-4333-8333-333333333333',
        confidence: undefined,
        payload: { uniformed: true },
      }),
    );

    const emits = emit.mock.calls.filter((c) => c[0] === InternalEvent.PersonUnknown);
    expect(emits).toHaveLength(1);
    expect(emits[0]![1] as PersonUnknownPayload).toEqual({
      deviceId: 'dev-1',
      eventId: '33333333-3333-4333-8333-333333333333',
      occurredAt: '2026-07-06T18:00:00.000Z',
      uniformed: true,
    });
  });

  it('defaults uniformed to false when the payload omits it', async () => {
    await events.ingest(
      envelope({ type: EventType.PersonUnknown, eventId: '44444444-4444-4444-8444-444444444444' }),
    );
    const emits = emit.mock.calls.filter((c) => c[0] === InternalEvent.PersonUnknown);
    expect((emits[0]![1] as PersonUnknownPayload).uniformed).toBe(false);
  });

  it('emits ZoneEntered with the zone id when a zone.entry carries one', async () => {
    await events.ingest(
      envelope({
        type: EventType.ZoneEntry,
        eventId: '55555555-5555-4555-8555-555555555555',
        confidence: undefined,
        payload: { zoneId: 'zone-42' },
      }),
    );

    const emits = emit.mock.calls.filter((c) => c[0] === InternalEvent.ZoneEntered);
    expect(emits).toHaveLength(1);
    expect(emits[0]![1] as ZoneEnteredPayload).toEqual({
      deviceId: 'dev-1',
      eventId: '55555555-5555-4555-8555-555555555555',
      occurredAt: '2026-07-06T18:00:00.000Z',
      zoneId: 'zone-42',
    });
  });

  it('does not emit ZoneEntered when the zone.entry omits a zone id', async () => {
    await events.ingest(
      envelope({ type: EventType.ZoneEntry, eventId: '66666666-6666-4666-8666-666666666666' }),
    );
    expect(emit.mock.calls.some((c) => c[0] === InternalEvent.ZoneEntered)).toBe(false);
  });

  it('emits ZoneExited with the zone id when a zone.exit carries one', async () => {
    await events.ingest(
      envelope({
        type: EventType.ZoneExit,
        eventId: '77777777-7777-4777-8777-777777777777',
        confidence: undefined,
        payload: { zoneId: 'zone-door' },
      }),
    );

    const emits = emit.mock.calls.filter((c) => c[0] === InternalEvent.ZoneExited);
    expect(emits).toHaveLength(1);
    expect(emits[0]![1] as ZoneExitedPayload).toEqual({
      deviceId: 'dev-1',
      eventId: '77777777-7777-4777-8777-777777777777',
      occurredAt: '2026-07-06T18:00:00.000Z',
      zoneId: 'zone-door',
    });
  });

  it('emits VoiceCheckinReported with a recognized on-device check-in result (F1.3)', async () => {
    await events.ingest(
      envelope({
        type: EventType.VoiceCheckinResult,
        eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        confidence: undefined,
        payload: { result: 'i_am_fine' },
      }),
    );

    const emits = emit.mock.calls.filter((c) => c[0] === InternalEvent.VoiceCheckinReported);
    expect(emits).toHaveLength(1);
    expect(emits[0]![1] as VoiceCheckinReportedPayload).toEqual({
      deviceId: 'dev-1',
      eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      occurredAt: '2026-07-06T18:00:00.000Z',
      result: 'i_am_fine',
    });
  });

  it('does not emit VoiceCheckinReported when the result is missing or unknown', async () => {
    await events.ingest(
      envelope({
        type: EventType.VoiceCheckinResult,
        eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        confidence: undefined,
        payload: { result: 'maybe_ok' },
      }),
    );
    expect(emit.mock.calls.some((c) => c[0] === InternalEvent.VoiceCheckinReported)).toBe(false);
  });

  it('reads back VLM second opinions for a flagged event, dropping malformed ones (F3.1)', async () => {
    const flag = '99999999-9999-4999-8999-999999999999';
    // A well-formed verdict.
    await events.ingest(
      envelope({
        type: EventType.VlmVerdict,
        eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        occurredAt: '2026-07-06T18:01:00.000Z',
        confidence: 0.9,
        payload: { aboutEventId: flag, verdict: 'confirmed', onFloor: true },
      }),
    );
    // A malformed verdict (bad enum) about the same flag — must be dropped, not thrown.
    await events.ingest(
      envelope({
        type: EventType.VlmVerdict,
        eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        occurredAt: '2026-07-06T18:02:00.000Z',
        confidence: undefined,
        payload: { aboutEventId: flag, verdict: 'maybe' },
      }),
    );

    const opinions = await events.secondOpinionsFor('dev-1', flag);
    expect(opinions).toHaveLength(1);
    expect(opinions[0]).toMatchObject({ verdict: 'confirmed', onFloor: true, confidence: 0.9 });
  });

  it('reports presence since an instant for zone/person events but not heartbeats', async () => {
    await events.ingest(
      envelope({
        type: EventType.PersonUnknown,
        eventId: '88888888-8888-4888-8888-888888888888',
        occurredAt: '2026-07-06T18:05:00.000Z',
      }),
    );
    // A person was seen after 18:00, so presence is true from then...
    expect(await events.hasPresenceSince('dev-1', '2026-07-06T18:00:00.000Z')).toBe(true);
    // ...but not after the event itself (strictly-after semantics).
    expect(await events.hasPresenceSince('dev-1', '2026-07-06T18:05:00.000Z')).toBe(false);
    // A different device has no presence.
    expect(await events.hasPresenceSince('dev-2', '2026-07-06T18:00:00.000Z')).toBe(false);
  });

  it('does not emit on an idempotent replay (already ingested)', async () => {
    await events.ingest(envelope());
    emit.mockClear();

    // Same (eventId, occurredAt) — a QoS-1 redelivery must not start a second incident.
    const replay = await events.ingest(envelope());
    expect(replay.inserted).toBe(false);
    expect(emit.mock.calls.some((c) => c[0] === InternalEvent.FallDetected)).toBe(false);
  });
});
