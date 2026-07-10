import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppConfig } from '../../config/env.validation';
import { EventsService } from '../events/events.service';
import { InMemoryEventStreamRepository } from '../events/in-memory-event-stream.repository';
import { FleetService } from '../fleet/fleet.service';
import { InMemoryHeartbeatRepository } from '../fleet/in-memory-heartbeat.repository';
import { PresenceService } from '../fleet/presence.service';
import { MqttIngestionService } from './mqtt-ingestion.service';

const DEVICE = 'dev-1';
const EVENTS_TOPIC = `obrigada/dev/${DEVICE}/events`;
const HEARTBEAT_TOPIC = `obrigada/dev/${DEVICE}/heartbeat`;

function envelope(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      eventId: '11111111-1111-4111-8111-111111111111',
      deviceId: DEVICE,
      type: 'fall.suspected',
      occurredAt: '2026-07-06T18:00:00.000Z',
      confidence: 0.94,
      payload: {},
      ...overrides,
    }),
  );
}

describe('MqttIngestionService.handleMessage', () => {
  let events: EventsService;
  let heartbeats: InMemoryHeartbeatRepository;
  let service: MqttIngestionService;

  beforeEach(() => {
    events = new EventsService(new InMemoryEventStreamRepository(), new EventEmitter2());
    heartbeats = new InMemoryHeartbeatRepository();
    const fleet = new FleetService(heartbeats, new PresenceService(null));
    service = new MqttIngestionService({} as AppConfig, events, fleet);
  });

  it('ingests a valid event', async () => {
    await service.handleMessage(EVENTS_TOPIC, envelope());
    expect(await events.countForDevice(DEVICE)).toBe(1);
  });

  it('is idempotent on replay (QoS-1 redelivery / offline replay)', async () => {
    await service.handleMessage(EVENTS_TOPIC, envelope());
    await service.handleMessage(EVENTS_TOPIC, envelope());
    await service.handleMessage(EVENTS_TOPIC, envelope());
    expect(await events.countForDevice(DEVICE)).toBe(1);
  });

  it('drops an event whose body deviceId does not match the topic', async () => {
    await service.handleMessage(EVENTS_TOPIC, envelope({ deviceId: 'someone-else' }));
    expect(await events.countForDevice(DEVICE)).toBe(0);
    expect(await events.countForDevice('someone-else')).toBe(0);
  });

  it('rejects an event carrying raw media (rule #1)', async () => {
    await service.handleMessage(EVENTS_TOPIC, envelope({ payload: { image: 'base64...' } }));
    expect(await events.countForDevice(DEVICE)).toBe(0);
  });

  it('drops non-JSON payloads without throwing', async () => {
    await expect(
      service.handleMessage(EVENTS_TOPIC, Buffer.from('not json')),
    ).resolves.toBeUndefined();
    expect(await events.countForDevice(DEVICE)).toBe(0);
  });

  it('ignores unrecognized topics', async () => {
    await service.handleMessage('obrigada/dev/dev-1/unknown', envelope());
    await service.handleMessage('totally/wrong', envelope());
    expect(await events.countForDevice(DEVICE)).toBe(0);
  });

  it('records a heartbeat', async () => {
    await service.handleMessage(
      HEARTBEAT_TOPIC,
      Buffer.from(JSON.stringify({ time: '2026-07-06T18:00:00.000Z', batteryPct: 82 })),
    );
    expect(await heartbeats.countByDevice(DEVICE)).toBe(1);
  });
});
