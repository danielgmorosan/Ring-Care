import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import type { AppConfig } from '../../config/env.validation';
import type { Device } from '../devices/device.entity';
import { DevicesService } from '../devices/devices.service';
import { InMemoryDeviceRepository } from '../devices/in-memory-device.repository';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { FleetHealthService } from './fleet-health.service';
import { InMemoryHeartbeatRepository } from './in-memory-heartbeat.repository';

const FAMILY = '00000000-0000-4000-8000-00000000fa11';
const OTHER = '00000000-0000-4000-8000-00000000fa22';
const NOW = Date.parse('2026-07-08T12:00:00.000Z');

function config(): AppConfig {
  return { deviceOfflineThresholdSeconds: 90 } as unknown as AppConfig;
}

describe('FleetHealthService', () => {
  let deviceRepo: InMemoryDeviceRepository;
  let heartbeats: InMemoryHeartbeatRepository;
  let service: FleetHealthService;

  function device(id: string, familyId: string, status: Device['status']): Device {
    return { id, familyId, name: `Guardian ${id}`, status, registeredAt: '2026-07-01T00:00:00Z' };
  }

  beforeEach(async () => {
    deviceRepo = new InMemoryDeviceRepository();
    heartbeats = new InMemoryHeartbeatRepository();
    const families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    const devices = new DevicesService(deviceRepo, families, new EventEmitter2());
    service = new FleetHealthService(devices, heartbeats, config());
  });

  it('reports a guardian online with battery, app version, and model versions', async () => {
    await deviceRepo.create(device('d1', FAMILY, 'online'));
    await heartbeats.record({
      deviceId: 'd1',
      time: new Date(NOW - 20_000).toISOString(), // 20s ago, within 90s threshold
      batteryPct: 82,
      thermalC: 31,
      appVersion: '1.4.0',
      models: { pose: 'movenet-1.2', face: 'arcface-0.9' },
    });

    const [g] = await service.forFamily(FAMILY, NOW);

    expect(g).toMatchObject({
      id: 'd1',
      online: true,
      batteryPct: 82,
      appVersion: '1.4.0',
      models: { pose: 'movenet-1.2', face: 'arcface-0.9' },
    });
    expect(g!.lastSeenAt).toBe(new Date(NOW - 20_000).toISOString());
  });

  it('reports offline when the last heartbeat is older than the threshold', async () => {
    await deviceRepo.create(device('d1', FAMILY, 'online'));
    await heartbeats.record({
      deviceId: 'd1',
      time: new Date(NOW - 10 * 60_000).toISOString(), // 10 min ago
      batteryPct: 50,
      thermalC: null,
      appVersion: '1.4.0',
      models: null,
    });

    const [g] = await service.forFamily(FAMILY, NOW);
    expect(g!.online).toBe(false);
    expect(g!.batteryPct).toBe(50); // still shows the last-known battery
  });

  it('handles a never-seen guardian: offline, no health yet', async () => {
    await deviceRepo.create(device('d2', FAMILY, 'provisioning'));
    const [g] = await service.forFamily(FAMILY, NOW);
    expect(g).toMatchObject({
      id: 'd2',
      status: 'provisioning',
      online: false,
      lastSeenAt: null,
      batteryPct: null,
    });
  });

  it('uses the most recent heartbeat when several exist', async () => {
    await deviceRepo.create(device('d1', FAMILY, 'online'));
    await heartbeats.record({
      deviceId: 'd1',
      time: new Date(NOW - 60_000).toISOString(),
      batteryPct: 90,
      thermalC: null,
      appVersion: '1.3.0',
      models: null,
    });
    await heartbeats.record({
      deviceId: 'd1',
      time: new Date(NOW - 10_000).toISOString(),
      batteryPct: 88,
      thermalC: null,
      appVersion: '1.4.0',
      models: null,
    });

    const [g] = await service.forFamily(FAMILY, NOW);
    expect(g).toMatchObject({ batteryPct: 88, appVersion: '1.4.0' });
  });

  it('only returns the caller family’s guardians', async () => {
    await deviceRepo.create(device('mine', FAMILY, 'online'));
    await deviceRepo.create(device('theirs', OTHER, 'online'));

    const fleet = await service.forFamily(FAMILY, NOW);
    expect(fleet.map((g) => g.id)).toEqual(['mine']);
  });

  it('returns a guardian’s battery/thermal history newest first', async () => {
    await deviceRepo.create(device('d1', FAMILY, 'online'));
    await heartbeats.record({
      deviceId: 'd1',
      time: new Date(NOW - 120_000).toISOString(),
      batteryPct: 90,
      thermalC: 29,
      appVersion: '1.4.0',
      models: null,
    });
    await heartbeats.record({
      deviceId: 'd1',
      time: new Date(NOW - 10_000).toISOString(),
      batteryPct: 84,
      thermalC: 33,
      appVersion: '1.4.0',
      models: null,
    });

    const history = await service.historyForFamily(FAMILY, 'd1');

    expect(history.map((p) => p.batteryPct)).toEqual([84, 90]); // newest first
    expect(history[0]).toMatchObject({ batteryPct: 84, thermalC: 33 });
  });

  it('hides another family’s guardian history behind a 404', async () => {
    await deviceRepo.create(device('theirs', OTHER, 'online'));

    await expect(service.historyForFamily(FAMILY, 'theirs')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.historyForFamily(FAMILY, 'ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
