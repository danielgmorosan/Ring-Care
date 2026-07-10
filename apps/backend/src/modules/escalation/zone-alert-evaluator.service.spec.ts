import type { DevicesService } from '../devices/devices.service';
import type { FamiliesService } from '../families/families.service';
import type { Zone } from '../zones/zone.entity';
import type { ZonesService } from '../zones/zones.service';
import type { NewAlert } from './alert.repository';
import type { AlertsService } from './alerts.service';
import { isUnusualHour, ZoneAlertEvaluatorService } from './zone-alert-evaluator.service';

const DEVICE = 'device-1';
const FAMILY = 'fam-1';
// Hours in UTC to avoid DST ambiguity: 15:00 is daytime, 03:00 is night.
const DAYTIME = '2026-07-09T15:00:00.000Z';
const NIGHT = '2026-07-09T03:00:00.000Z';

function zone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 'zone-1',
    deviceId: DEVICE,
    familyId: FAMILY,
    name: 'Stove',
    kind: 'hazard',
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

function zoneEntered(overrides: { zoneId?: string; occurredAt?: string } = {}) {
  return {
    deviceId: DEVICE,
    eventId: 'evt-1',
    occurredAt: overrides.occurredAt ?? DAYTIME,
    zoneId: overrides.zoneId ?? 'zone-1',
  };
}

describe('ZoneAlertEvaluatorService', () => {
  let evaluator: ZoneAlertEvaluatorService;
  let raised: NewAlert[];
  let deviceZones: Zone[];
  let timezone: string;

  function build(deviceFound = true): ZoneAlertEvaluatorService {
    const devices = {
      findById: async (id: string) =>
        deviceFound && id === DEVICE ? { id: DEVICE, familyId: FAMILY } : null,
    } as unknown as DevicesService;
    const zones = {
      activeOnDevice: async (id: string) => (id === DEVICE ? deviceZones : []),
    } as unknown as ZonesService;
    const families = {
      findByIdOrFail: async () => ({ timezone }),
    } as unknown as FamiliesService;
    const alerts = {
      raise: async (alert: NewAlert) => {
        raised.push(alert);
      },
    } as unknown as AlertsService;
    return new ZoneAlertEvaluatorService(devices, zones, families, alerts);
  }

  beforeEach(() => {
    raised = [];
    deviceZones = [zone()];
    timezone = 'UTC';
    evaluator = build();
  });

  it('raises a hazard-zone alert naming the zone', async () => {
    await evaluator.onZoneEntered(zoneEntered());

    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      kind: 'hazard_zone',
      message: 'Someone is in the Stove. Open the app to take a look.',
      ref: 'evt-1',
    });
  });

  it('does not alert on a daytime door crossing (that feeds the return timer)', async () => {
    deviceZones = [zone({ kind: 'door', name: 'Front door' })];

    await evaluator.onZoneEntered(zoneEntered({ occurredAt: DAYTIME }));

    expect(raised).toHaveLength(0);
  });

  it('raises a door alert at an unusual hour, naming the door', async () => {
    deviceZones = [zone({ kind: 'door', name: 'Front door' })];

    await evaluator.onZoneEntered(zoneEntered({ occurredAt: NIGHT }));

    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      kind: 'door_unusual_hour',
      message: 'Someone is at the Front door, and it is late. Open the app to take a look.',
    });
  });

  it('uses the family timezone: 03:00 UTC is daytime in Tokyo, so no door alert', async () => {
    deviceZones = [zone({ kind: 'door', name: 'Front door' })];
    timezone = 'Asia/Tokyo'; // 03:00Z is 12:00 local — ordinary daytime

    await evaluator.onZoneEntered(zoneEntered({ occurredAt: NIGHT }));

    expect(raised).toHaveLength(0);
  });

  it('ignores a zone id not active on the device', async () => {
    deviceZones = [];

    await evaluator.onZoneEntered(zoneEntered({ zoneId: 'ghost-zone' }));

    expect(raised).toHaveLength(0);
  });

  it('ignores a crossing from an unregistered device without throwing', async () => {
    evaluator = build(false);

    await expect(evaluator.onZoneEntered(zoneEntered())).resolves.toBeUndefined();
    expect(raised).toHaveLength(0);
  });

  it('never throws even when raising the alert fails', async () => {
    const devices = {
      findById: async () => ({ id: DEVICE, familyId: FAMILY }),
    } as unknown as DevicesService;
    const zones = { activeOnDevice: async () => [zone()] } as unknown as ZonesService;
    const families = {
      findByIdOrFail: async () => ({ timezone: 'UTC' }),
    } as unknown as FamiliesService;
    const alerts = {
      raise: async () => {
        throw new Error('db down');
      },
    } as unknown as AlertsService;
    const guarded = new ZoneAlertEvaluatorService(devices, zones, families, alerts);

    await expect(guarded.onZoneEntered(zoneEntered())).resolves.toBeUndefined();
  });
});

describe('isUnusualHour', () => {
  it('treats 22:00–06:59 as unusual and daytime as ordinary', () => {
    expect(isUnusualHour(22)).toBe(true);
    expect(isUnusualHour(23)).toBe(true);
    expect(isUnusualHour(0)).toBe(true);
    expect(isUnusualHour(6)).toBe(true);
    expect(isUnusualHour(7)).toBe(false);
    expect(isUnusualHour(12)).toBe(false);
    expect(isUnusualHour(21)).toBe(false);
  });
});
