import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { InternalEvent } from '../../internal-events/internal-events';
import { FamiliesService } from './families.service';
import { InMemoryFamilyRepository } from './in-memory-family.repository';

describe('FamiliesService', () => {
  let service: FamiliesService;
  let bus: EventEmitter2;

  beforeEach(() => {
    bus = new EventEmitter2();
    service = new FamiliesService(new InMemoryFamilyRepository(), bus);
  });

  it('creates a family and returns it with an id and timestamp', async () => {
    const family = await service.create({ name: 'Silva family' });

    expect(family.id).toEqual(expect.any(String));
    expect(family.name).toBe('Silva family');
    expect(() => new Date(family.createdAt).toISOString()).not.toThrow();
  });

  it('defaults timezone to UTC, keeps a valid one, and rejects a bad one', async () => {
    expect((await service.create({ name: 'A' })).timezone).toBe('UTC');
    expect((await service.create({ name: 'B', timezone: 'Europe/Lisbon' })).timezone).toBe(
      'Europe/Lisbon',
    );
    expect((await service.create({ name: 'C', timezone: 'Not/AZone' })).timezone).toBe('UTC');
  });

  it('emits family.created on the internal bus', async () => {
    const handler = jest.fn();
    bus.on(InternalEvent.FamilyCreated, handler);

    const family = await service.create({ name: 'Costa family' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: family.id, createdAt: family.createdAt }),
    );
  });

  it('lists created families', async () => {
    await service.create({ name: 'A' });
    await service.create({ name: 'B' });

    const all = await service.findAll();
    expect(all).toHaveLength(2);
  });

  it('throws NotFound for an unknown family id', async () => {
    await expect(service.findByIdOrFail('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates the timezone, normalizing an invalid one to UTC', async () => {
    const family = await service.create({ name: 'Silva family', timezone: 'Europe/Lisbon' });

    expect((await service.update(family.id, { timezone: 'America/New_York' })).timezone).toBe(
      'America/New_York',
    );
    expect((await service.update(family.id, { timezone: 'Not/AZone' })).timezone).toBe('UTC');
  });

  it('updates only the fields provided, leaving the rest untouched', async () => {
    const family = await service.create({ name: 'Silva family', timezone: 'Europe/Lisbon' });

    const renamed = await service.update(family.id, { name: 'Costa family' });
    expect(renamed.name).toBe('Costa family');
    // Timezone was not in the patch, so it must be unchanged.
    expect(renamed.timezone).toBe('Europe/Lisbon');
  });

  it('throws NotFound when updating an unknown family', async () => {
    await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('starts with no elder name or relation', async () => {
    const family = await service.create({ name: 'Silva family' });
    expect(family.elderName).toBeNull();
    expect(family.elderRelation).toBeNull();
  });

  it('sets, keeps, and clears the elder name and relation', async () => {
    const family = await service.create({ name: 'Silva family' });

    const named = await service.update(family.id, { elderName: 'Maria', elderRelation: 'mother' });
    expect(named.elderName).toBe('Maria');
    expect(named.elderRelation).toBe('mother');

    // Not in the patch: unchanged.
    const renamed = await service.update(family.id, { name: 'Costa family' });
    expect(renamed.elderName).toBe('Maria');
    expect(renamed.elderRelation).toBe('mother');

    // Null clears.
    const cleared = await service.update(family.id, { elderName: null, elderRelation: null });
    expect(cleared.elderName).toBeNull();
    expect(cleared.elderRelation).toBeNull();
  });
});
