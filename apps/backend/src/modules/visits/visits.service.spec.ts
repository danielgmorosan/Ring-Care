import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { InMemoryVisitsRepository } from './in-memory-visits.repository';
import { VisitsService } from './visits.service';

const MISSING_FAMILY = '00000000-0000-4000-8000-000000000099';
const MISSING_VISIT = '00000000-0000-4000-8000-000000000042';

// A Thursday-afternoon visit window.
const START = '2026-07-09T14:00:00.000Z';
const END = '2026-07-09T17:00:00.000Z';

describe('VisitsService', () => {
  let service: VisitsService;
  let families: FamiliesService;
  let familyId: string;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    service = new VisitsService(new InMemoryVisitsRepository(), families);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  it('logs a visit and lists it back, defaulting notes to null', async () => {
    const created = await service.create(familyId, {
      visitorLabel: 'Nurse',
      startsAt: START,
      endsAt: END,
    });

    expect(created).toMatchObject({ visitorLabel: 'Nurse', notes: null });
    const list = await service.list(familyId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ visitorLabel: 'Nurse', startsAt: START, endsAt: END });
  });

  it('rejects a window that ends at or before it starts', async () => {
    await expect(
      service.create(familyId, { visitorLabel: 'Nurse', startsAt: END, endsAt: START }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(familyId, { visitorLabel: 'Nurse', startsAt: START, endsAt: START }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('finds a visit covering a moment inside its window, and none outside', async () => {
    await service.create(familyId, { visitorLabel: 'Nurse', startsAt: START, endsAt: END });

    const during = await service.covering(familyId, '2026-07-09T15:30:00.000Z');
    expect(during).toHaveLength(1);
    expect(during[0]).toMatchObject({ visitorLabel: 'Nurse' });

    const before = await service.covering(familyId, '2026-07-09T09:00:00.000Z');
    expect(before).toHaveLength(0);
  });

  it('scopes covering() to the family — another family sees nothing', async () => {
    await service.create(familyId, { visitorLabel: 'Nurse', startsAt: START, endsAt: END });
    const other = await families.create({ name: 'Costa family' });

    expect(await service.covering(other.id, '2026-07-09T15:30:00.000Z')).toHaveLength(0);
  });

  it('updates a field and re-validates the resulting window', async () => {
    const visit = await service.create(familyId, {
      visitorLabel: 'Nurse',
      startsAt: START,
      endsAt: END,
    });

    const updated = await service.update(familyId, visit.id, { visitorLabel: 'District nurse' });
    expect(updated.visitorLabel).toBe('District nurse');

    // Moving endsAt before startsAt is rejected even though only endsAt changed.
    await expect(
      service.update(familyId, visit.id, { endsAt: '2026-07-09T13:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects operations for an unknown family', async () => {
    await expect(
      service.create(MISSING_FAMILY, { visitorLabel: 'X', startsAt: START, endsAt: END }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list(MISSING_FAMILY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not touch another family’s visit', async () => {
    const mine = await service.create(familyId, {
      visitorLabel: 'Nurse',
      startsAt: START,
      endsAt: END,
    });
    const other = await families.create({ name: 'Costa family' });

    await expect(service.delete(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(other.id, mine.id, { visitorLabel: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await service.list(familyId)).toHaveLength(1);
  });

  it('throws NotFound updating or deleting a missing visit', async () => {
    await expect(
      service.update(familyId, MISSING_VISIT, { visitorLabel: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete(familyId, MISSING_VISIT)).rejects.toBeInstanceOf(NotFoundException);
  });
});
