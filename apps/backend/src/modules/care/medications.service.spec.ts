import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { InMemoryMedicationRepository } from './in-memory-medication.repository';
import { MedicationsService } from './medications.service';

describe('MedicationsService', () => {
  let service: MedicationsService;
  let families: FamiliesService;
  let familyId: string;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    service = new MedicationsService(new InMemoryMedicationRepository(), families);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  it('adds a medication and lists it back', async () => {
    const created = await service.create(familyId, {
      name: 'Bisoprolol',
      dosage: '5mg',
      times: ['20:00', '08:00'],
      notes: 'With food',
    });

    expect(created.times).toEqual(['08:00', '20:00']); // normalized: sorted
    const list = await service.list(familyId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Bisoprolol', dosage: '5mg', notes: 'With food' });
  });

  it('defaults optional fields and de-duplicates times', async () => {
    const created = await service.create(familyId, {
      name: 'Vitamin D',
      times: ['09:00', '09:00'],
    });
    expect(created).toMatchObject({ dosage: null, notes: null, times: ['09:00'] });
  });

  it('rejects operations for an unknown family', async () => {
    await expect(
      service.create('00000000-0000-4000-8000-000000000099', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list('00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not delete another family’s medication', async () => {
    const mine = await service.create(familyId, { name: 'Aspirin' });
    const other = await families.create({ name: 'Costa family' });

    await expect(service.delete(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    // Mine is untouched.
    expect(await service.list(familyId)).toHaveLength(1);
  });

  it('deletes a medication', async () => {
    const med = await service.create(familyId, { name: 'Aspirin' });
    await service.delete(familyId, med.id);
    expect(await service.list(familyId)).toHaveLength(0);
  });

  it('updates only the provided fields and normalizes times', async () => {
    const med = await service.create(familyId, {
      name: 'Bisoprolol',
      dosage: '5mg',
      times: ['08:00'],
    });

    const updated = await service.update(familyId, med.id, {
      dosage: '10mg',
      times: ['20:00', '08:00'],
    });

    expect(updated).toMatchObject({
      name: 'Bisoprolol',
      dosage: '10mg',
      times: ['08:00', '20:00'],
    });
  });

  it('throws NotFound updating a missing or another family’s medication', async () => {
    const med = await service.create(familyId, { name: 'Aspirin' });
    const other = await families.create({ name: 'Costa family' });
    await expect(service.update(other.id, med.id, { dosage: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(familyId, '00000000-0000-4000-8000-000000000042', { dosage: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
