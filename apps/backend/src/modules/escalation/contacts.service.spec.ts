import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { ContactsService } from './contacts.service';
import { InMemoryContactRepository } from './in-memory-contact.repository';

describe('ContactsService', () => {
  let service: ContactsService;
  let families: FamiliesService;
  let familyId: string;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    service = new ContactsService(new InMemoryContactRepository(), families);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  it('creates a contact and lists the chain in priority order', async () => {
    await service.create(familyId, { name: 'Miguel', role: 'son', priority: 1 });
    await service.create(familyId, {
      name: 'Ana',
      role: 'daughter',
      phone: '+351912345678',
      priority: 0,
      quietHours: { start: '22:00', end: '07:00', wakeForConfirmedFallOnly: true },
    });

    const chain = await service.list(familyId);
    expect(chain.map((c) => c.name)).toEqual(['Ana', 'Miguel']);
    expect(chain[0]!.quietHours?.wakeForConfirmedFallOnly).toBe(true);
  });

  it('rejects operations for an unknown family', async () => {
    await expect(
      service.create('00000000-0000-4000-8000-000000000099', {
        name: 'X',
        role: 'friend',
        priority: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list('00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates a contact partially (reorder + clear quiet hours untouched fields intact)', async () => {
    const ana = await service.create(familyId, {
      name: 'Ana',
      role: 'daughter',
      phone: '+351912345678',
      priority: 0,
    });

    const updated = await service.update(familyId, ana.id, { priority: 2 });

    expect(updated.priority).toBe(2);
    expect(updated.name).toBe('Ana'); // untouched fields intact
    expect(updated.phone).toBe('+351912345678');
  });

  it('throws NotFound when updating or deleting a missing contact', async () => {
    await expect(
      service.update(familyId, '00000000-0000-4000-8000-000000000042', { priority: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.delete(familyId, '00000000-0000-4000-8000-000000000042'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a contact from the chain', async () => {
    const ana = await service.create(familyId, { name: 'Ana', role: 'daughter', priority: 0 });
    await service.delete(familyId, ana.id);
    expect(await service.list(familyId)).toHaveLength(0);
  });
});
