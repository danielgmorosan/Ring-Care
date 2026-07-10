import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { ActivityService } from './activity.service';
import { InMemoryAccessLogRepository } from './in-memory-access-log.repository';

describe('ActivityService', () => {
  let log: InMemoryAccessLogRepository;
  let families: FamiliesService;
  let service: ActivityService;
  let familyId: string;

  beforeEach(async () => {
    log = new InMemoryAccessLogRepository();
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    service = new ActivityService(log, families);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  it('returns the family activity newest-first with human labels', async () => {
    await log.record({
      familyId,
      userId: 'u1',
      action: 'medications.create',
      method: 'POST',
      route: '/me/medications',
    });
    await log.record({
      familyId,
      userId: 'u1',
      action: 'contacts.delete',
      method: 'DELETE',
      route: '/me/contacts/:id',
    });

    const activity = await service.forFamily(familyId);

    expect(activity.map((a) => a.label)).toEqual(['Removed a contact', 'Added a medication']);
    expect(activity[0]).toHaveProperty('at');
  });

  it('never returns another family’s activity', async () => {
    const other = await families.create({ name: 'Costa family' });
    await log.record({
      familyId: other.id,
      userId: 'u2',
      action: 'medications.create',
      method: 'POST',
      route: '/me/medications',
    });

    expect(await service.forFamily(familyId)).toHaveLength(0);
  });

  it('rejects an unknown family', async () => {
    await expect(service.forFamily('00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
