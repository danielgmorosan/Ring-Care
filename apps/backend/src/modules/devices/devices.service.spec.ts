import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { InternalEvent } from '../../internal-events/internal-events';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { DevicesService } from './devices.service';
import { InMemoryDeviceRepository } from './in-memory-device.repository';

describe('DevicesService', () => {
  let devices: DevicesService;
  let families: FamiliesService;
  let bus: EventEmitter2;

  beforeEach(() => {
    bus = new EventEmitter2();
    families = new FamiliesService(new InMemoryFamilyRepository(), bus);
    devices = new DevicesService(new InMemoryDeviceRepository(), families, bus);
  });

  it('registers a device to an existing family', async () => {
    const family = await families.create({ name: 'Silva family' });

    const device = await devices.register({ familyId: family.id, name: 'Kitchen shelf' });

    expect(device.id).toEqual(expect.any(String));
    expect(device.familyId).toBe(family.id);
    expect(device.status).toBe('registered');
  });

  it('refuses to register a device to an unknown family', async () => {
    await expect(
      devices.register({ familyId: 'does-not-exist', name: 'Kitchen shelf' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emits device.registered on the internal bus', async () => {
    const family = await families.create({ name: 'Costa family' });
    const handler = jest.fn();
    bus.on(InternalEvent.DeviceRegistered, handler);

    const device = await devices.register({ familyId: family.id, name: 'Hallway' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: device.id, familyId: family.id }),
    );
  });

  it('lists devices filtered by family', async () => {
    const a = await families.create({ name: 'A' });
    const b = await families.create({ name: 'B' });
    await devices.register({ familyId: a.id, name: 'A-1' });
    await devices.register({ familyId: a.id, name: 'A-2' });
    await devices.register({ familyId: b.id, name: 'B-1' });

    expect(await devices.findByFamily(a.id)).toHaveLength(2);
    expect(await devices.findByFamily(b.id)).toHaveLength(1);
    expect(await devices.findAll()).toHaveLength(3);
  });
});
