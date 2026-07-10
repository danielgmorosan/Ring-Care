import { NotFoundException } from '@nestjs/common';
import type { DevicesService } from '../devices/devices.service';
import { InMemoryZoneRepository } from './in-memory-zone.repository';
import { ZonesService } from './zones.service';

const FAMILY = 'fam-1';
const OTHER_FAMILY = 'fam-2';
const DEVICE = 'device-1';
const MISSING_ZONE = '00000000-0000-4000-8000-000000000042';

const TRIANGLE = [
  { x: 0.1, y: 0.1 },
  { x: 0.5, y: 0.2 },
  { x: 0.3, y: 0.6 },
];

describe('ZonesService', () => {
  let service: ZonesService;
  let repo: InMemoryZoneRepository;

  beforeEach(() => {
    repo = new InMemoryZoneRepository();
    // A device that belongs to FAMILY only.
    const devices = {
      findById: async (id: string) => (id === DEVICE ? { id: DEVICE, familyId: FAMILY } : null),
    } as unknown as DevicesService;
    service = new ZonesService(repo, devices);
  });

  it('creates a zone on an owned device and lists it back', async () => {
    const created = await service.create(FAMILY, {
      deviceId: DEVICE,
      name: 'Stove',
      kind: 'hazard',
      points: TRIANGLE,
    });

    expect(created).toMatchObject({ name: 'Stove', kind: 'hazard', deviceId: DEVICE });
    expect(created.active).toBe(true);
    const list = await service.list(FAMILY);
    expect(list).toHaveLength(1);
  });

  it('refuses to create a zone on a device the family does not own', async () => {
    await expect(
      service.create(OTHER_FAMILY, {
        deviceId: DEVICE,
        name: 'Stove',
        kind: 'hazard',
        points: TRIANGLE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Unknown device is likewise a 404.
    await expect(
      service.create(FAMILY, { deviceId: 'ghost', name: 'X', kind: 'door', points: TRIANGLE }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createOnDevice saves a zone under the device’s own family (F2.3)', async () => {
    const created = await service.createOnDevice(DEVICE, {
      deviceId: DEVICE,
      name: 'Stove',
      kind: 'hazard',
      points: TRIANGLE,
    });

    expect(created).toMatchObject({ name: 'Stove', kind: 'hazard', familyId: FAMILY });
    // The device reads it back through its own active-zones sync.
    expect(await service.activeOnDevice(DEVICE)).toHaveLength(1);
  });

  it('createOnDevice rejects an unknown device', async () => {
    await expect(
      service.createOnDevice('ghost', {
        deviceId: 'ghost',
        name: 'X',
        kind: 'door',
        points: TRIANGLE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only the provided fields', async () => {
    const zone = await service.create(FAMILY, {
      deviceId: DEVICE,
      name: 'Door',
      kind: 'door',
      points: TRIANGLE,
    });

    const updated = await service.update(FAMILY, zone.id, { name: 'Front door' });
    expect(updated).toMatchObject({ name: 'Front door', kind: 'door' });
  });

  it('soft-deletes: a removed zone disappears from the list', async () => {
    const zone = await service.create(FAMILY, {
      deviceId: DEVICE,
      name: 'Stairs',
      kind: 'hazard',
      points: TRIANGLE,
    });

    await service.remove(FAMILY, zone.id);
    expect(await service.list(FAMILY)).toHaveLength(0);
  });

  it('cannot update or remove a zone after it is deactivated', async () => {
    const zone = await service.create(FAMILY, {
      deviceId: DEVICE,
      name: 'Stairs',
      kind: 'hazard',
      points: TRIANGLE,
    });
    await service.remove(FAMILY, zone.id);

    await expect(service.update(FAMILY, zone.id, { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(FAMILY, zone.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not touch another family’s zone', async () => {
    const mine = await service.create(FAMILY, {
      deviceId: DEVICE,
      name: 'Stove',
      kind: 'hazard',
      points: TRIANGLE,
    });

    await expect(service.remove(OTHER_FAMILY, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(OTHER_FAMILY, mine.id, { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await service.list(FAMILY)).toHaveLength(1);
    expect(await service.list(OTHER_FAMILY)).toHaveLength(0);
  });

  it('throws NotFound updating or removing a missing zone', async () => {
    await expect(service.update(FAMILY, MISSING_ZONE, { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(FAMILY, MISSING_ZONE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes a device’s active zones for the device/evaluator to read', async () => {
    await service.create(FAMILY, {
      deviceId: DEVICE,
      name: 'Stove',
      kind: 'hazard',
      points: TRIANGLE,
    });
    expect(await repo.listActiveByDevice(DEVICE)).toHaveLength(1);
  });
});
