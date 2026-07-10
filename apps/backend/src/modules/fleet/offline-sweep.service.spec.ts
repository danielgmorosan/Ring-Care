import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppConfig } from '../../config/env.validation';
import { InternalEvent } from '../../internal-events/internal-events';
import { EventsService } from '../events/events.service';
import { InMemoryEventStreamRepository } from '../events/in-memory-event-stream.repository';
import { OfflineSweepService } from './offline-sweep.service';
import { PresenceService } from './presence.service';

const DEVICE = 'dev-1';
const T0 = Date.parse('2026-07-06T18:00:00.000Z');
const THRESHOLD_S = 90;

describe('OfflineSweepService', () => {
  let presence: PresenceService;
  let events: EventsService;
  let bus: EventEmitter2;
  let sweep: OfflineSweepService;

  beforeEach(() => {
    presence = new PresenceService(null);
    events = new EventsService(new InMemoryEventStreamRepository(), new EventEmitter2());
    bus = new EventEmitter2();
    sweep = new OfflineSweepService(presence, events, bus, {
      deviceOfflineThresholdSeconds: THRESHOLD_S,
    } as AppConfig);
  });

  it('does not flag a device still within the heartbeat threshold', async () => {
    await presence.touch(DEVICE, T0);
    const result = await sweep.sweep(T0 + 30_000); // 30s < 90s
    expect(result).toHaveLength(0);
  });

  it('flags a device that missed heartbeats, emits the event, and logs a record', async () => {
    await presence.touch(DEVICE, T0);
    const emitted: unknown[] = [];
    bus.on(InternalEvent.GuardianOffline, (p) => emitted.push(p));

    const result = await sweep.sweep(T0 + 100_000); // 100s > 90s

    expect(result.map((d) => d.deviceId)).toEqual([DEVICE]);
    expect(emitted).toHaveLength(1);
    // A guardian.offline record is appended to the (append-only) event stream.
    expect(await events.countForDevice(DEVICE)).toBe(1);
  });

  it('fires once per offline transition, not every sweep', async () => {
    await presence.touch(DEVICE, T0);
    await sweep.sweep(T0 + 100_000);
    const second = await sweep.sweep(T0 + 130_000);
    expect(second).toHaveLength(0);
    expect(await events.countForDevice(DEVICE)).toBe(1);
  });

  it('re-arms after the device recovers and goes dark again', async () => {
    await presence.touch(DEVICE, T0);
    await sweep.sweep(T0 + 100_000); // offline #1
    await presence.touch(DEVICE, T0 + 120_000); // heartbeat again (recovery)
    const result = await sweep.sweep(T0 + 220_000); // dark again
    expect(result.map((d) => d.deviceId)).toEqual([DEVICE]);
    expect(await events.countForDevice(DEVICE)).toBe(2);
  });
});
