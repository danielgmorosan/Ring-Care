import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { InMemoryPeopleRepository } from './in-memory-people.repository';
import { PeopleService } from './people.service';

const MISSING_FAMILY = '00000000-0000-4000-8000-000000000099';
const MISSING_PERSON = '00000000-0000-4000-8000-000000000042';

describe('PeopleService', () => {
  let service: PeopleService;
  let families: FamiliesService;
  let familyId: string;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    service = new PeopleService(new InMemoryPeopleRepository(), families);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  it('enrolls a person and lists them back, defaulting notes to null', async () => {
    const created = await service.create(familyId, { title: 'Grandfather', role: 'resident' });

    expect(created).toMatchObject({ title: 'Grandfather', role: 'resident', notes: null });
    expect(created.active).toBe(true);
    const list = await service.list(familyId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Grandfather', role: 'resident' });
  });

  it('rejects operations for an unknown family', async () => {
    await expect(
      service.create(MISSING_FAMILY, { title: 'X', role: 'family' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list(MISSING_FAMILY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only the provided fields', async () => {
    const person = await service.create(familyId, { title: 'Nurse', role: 'caregiver' });

    const updated = await service.update(familyId, person.id, { role: 'friend' });

    expect(updated).toMatchObject({ title: 'Nurse', role: 'friend' });
  });

  it('soft-deletes: a removed person disappears from the roster', async () => {
    const person = await service.create(familyId, { title: 'Helper', role: 'other' });

    await service.remove(familyId, person.id);

    expect(await service.list(familyId)).toHaveLength(0);
  });

  it('cannot update or remove a person after they are deactivated', async () => {
    const person = await service.create(familyId, { title: 'Helper', role: 'other' });
    await service.remove(familyId, person.id);

    await expect(service.update(familyId, person.id, { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(familyId, person.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not touch another family’s person', async () => {
    const mine = await service.create(familyId, { title: 'Grandmother', role: 'resident' });
    const other = await families.create({ name: 'Costa family' });

    await expect(service.remove(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(other.id, mine.id, { role: 'family' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // Mine is untouched and unchanged.
    const list = await service.list(familyId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ role: 'resident' });
  });

  it('throws NotFound updating or removing a missing person', async () => {
    await expect(service.update(familyId, MISSING_PERSON, { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(familyId, MISSING_PERSON)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
