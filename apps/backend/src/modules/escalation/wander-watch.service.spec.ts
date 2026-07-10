import type { AppConfig } from '../../config/env.validation';
import type { DevicesService } from '../devices/devices.service';
import type { EventsService } from '../events/events.service';
import type { Zone } from '../zones/zone.entity';
import type { ZonesService } from '../zones/zones.service';
import type { NewAlert } from './alert.repository';
import type { AlertsService } from './alerts.service';
import { InMemoryWanderWatchRepository } from './in-memory-wander-watch.repository';
import { WanderWatchService } from './wander-watch.service';

const DEVICE = 'device-1';
const FAMILY = 'fam-1';
const LEFT_AT = '2026-07-09T12:00:00.000Z';
const WINDOW_S = 900; // 15 min
const DUE = '2026-07-09T12:15:00.000Z'; // LEFT_AT + 15 min
const BEFORE_DUE = Date.parse('2026-07-09T12:10:00.000Z');
const AT_DUE = Date.parse(DUE);
const FAR_FUTURE = '2999-01-01T00:00:00.000Z';

function doorZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 'zone-door',
    deviceId: DEVICE,
    familyId: FAMILY,
    name: 'Front door',
    kind: 'door',
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.2 },
      { x: 0.3, y: 0.6 },
    ],
    active: true,
    createdAt: '1970-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function zoneExited(zoneId = 'zone-door', occurredAt = LEFT_AT) {
  return { deviceId: DEVICE, eventId: 'evt-exit', occurredAt, zoneId };
}

describe('WanderWatchService', () => {
  let repo: InMemoryWanderWatchRepository;
  let raised: NewAlert[];
  let zones: Zone[];
  let presenceSince: boolean;

  function build(): WanderWatchService {
    const devices = {
      findById: async (id: string) => (id === DEVICE ? { id: DEVICE, familyId: FAMILY } : null),
    } as unknown as DevicesService;
    const zonesSvc = {
      activeOnDevice: async (id: string) => (id === DEVICE ? zones : []),
    } as unknown as ZonesService;
    const events = {
      hasPresenceSince: async () => presenceSince,
    } as unknown as EventsService;
    const config = { wanderWindowSeconds: WINDOW_S } as unknown as AppConfig;
    const alerts = {
      raise: async (alert: NewAlert) => {
        raised.push(alert);
      },
    } as unknown as AlertsService;
    return new WanderWatchService(devices, zonesSvc, events, alerts, config, repo);
  }

  beforeEach(() => {
    repo = new InMemoryWanderWatchRepository();
    raised = [];
    zones = [doorZone()];
    presenceSince = false;
  });

  it('opens a watch on a door exit, due one window later', async () => {
    await build().onZoneExited(zoneExited());

    const [watch] = await repo.listDue(FAR_FUTURE);
    expect(watch).toMatchObject({ doorName: 'Front door', startedAt: LEFT_AT, dueAt: DUE });
  });

  it('opens no watch on a hazard-zone exit', async () => {
    zones = [doorZone({ kind: 'hazard', name: 'Stove' })];

    await build().onZoneExited(zoneExited());

    expect(await repo.listDue(FAR_FUTURE)).toHaveLength(0);
  });

  it('refreshes rather than stacking a second watch on another exit', async () => {
    const service = build();
    await service.onZoneExited(zoneExited('zone-door', '2026-07-09T12:00:00.000Z'));
    await service.onZoneExited(zoneExited('zone-door', '2026-07-09T12:05:00.000Z'));

    const watching = await repo.listDue(FAR_FUTURE);
    expect(watching).toHaveLength(1);
    expect(watching[0]!.startedAt).toBe('2026-07-09T12:05:00.000Z');
  });

  it('does nothing for a watch whose window has not closed yet', async () => {
    await build().onZoneExited(zoneExited());

    await build().sweep(BEFORE_DUE);

    expect(raised).toHaveLength(0);
    expect(await repo.listDue(FAR_FUTURE)).toHaveLength(1); // still watching
  });

  it('alerts the family when the window closes with no one seen again', async () => {
    presenceSince = false;
    await build().onZoneExited(zoneExited());

    await build().sweep(AT_DUE);

    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      kind: 'wander',
      message:
        'Someone left through the Front door and has not come back. Open the app to take a look.',
    });
    expect(await repo.listDue(FAR_FUTURE)).toHaveLength(0); // resolved
  });

  it('does not alert when someone was seen again before the window closed (returned)', async () => {
    presenceSince = true;
    await build().onZoneExited(zoneExited());

    await build().sweep(AT_DUE);

    expect(raised).toHaveLength(0);
    expect(await repo.listDue(FAR_FUTURE)).toHaveLength(0); // resolved as returned
  });

  it('survives a crash mid-wait: a fresh instance sweeps the persisted watch and alerts', async () => {
    // Open the watch, then discard the service instance without sweeping (the "crash").
    await build().onZoneExited(zoneExited());

    // A brand-new instance over the same (durable) repo runs the overdue sweep.
    const afterRestart = build();
    await afterRestart.sweep(AT_DUE);

    expect(raised).toHaveLength(1); // family alerted after the restart
    expect(await repo.listDue(FAR_FUTURE)).toHaveLength(0);
  });

  it('never throws out of the exit handler', async () => {
    const devices = {
      findById: async () => {
        throw new Error('db down');
      },
    } as unknown as DevicesService;
    const service = new WanderWatchService(
      devices,
      { activeOnDevice: async () => zones } as unknown as ZonesService,
      { hasPresenceSince: async () => false } as unknown as EventsService,
      { raise: async () => undefined } as unknown as AlertsService,
      { wanderWindowSeconds: WINDOW_S } as unknown as AppConfig,
      repo,
    );

    await expect(service.onZoneExited(zoneExited())).resolves.toBeUndefined();
  });
});
