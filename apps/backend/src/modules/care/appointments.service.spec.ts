import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { AppointmentsService } from './appointments.service';
import { InMemoryAppointmentRepository } from './in-memory-appointment.repository';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let families: FamiliesService;
  let familyId: string;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    service = new AppointmentsService(new InMemoryAppointmentRepository(), families);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  it('adds appointments and lists them soonest first', async () => {
    await service.create(familyId, { title: 'Cardiology', at: '2026-07-20T10:00:00.000Z' });
    await service.create(familyId, { title: 'Dentist', at: '2026-07-10T09:00:00.000Z' });

    const list = await service.list(familyId);
    expect(list.map((a) => a.title)).toEqual(['Dentist', 'Cardiology']);
    expect(list[0]).toMatchObject({ location: null, notes: null });
  });

  it('normalizes the datetime to a canonical instant', async () => {
    const created = await service.create(familyId, {
      title: 'Visit',
      at: '2026-07-09T10:00:00+01:00',
    });
    expect(created.at).toBe('2026-07-09T09:00:00.000Z');
  });

  it('rejects an unknown family', async () => {
    await expect(
      service.create('00000000-0000-4000-8000-000000000099', {
        title: 'X',
        at: '2026-07-09T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not delete another family’s appointment', async () => {
    const mine = await service.create(familyId, { title: 'Mine', at: '2026-07-09T10:00:00.000Z' });
    const other = await families.create({ name: 'Costa family' });
    await expect(service.delete(other.id, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.list(familyId)).toHaveLength(1);
  });

  it('updates fields and normalizes a new datetime', async () => {
    const appt = await service.create(familyId, {
      title: 'Cardiology',
      at: '2026-07-20T10:00:00.000Z',
    });

    const updated = await service.update(familyId, appt.id, {
      title: 'Cardiology follow-up',
      at: '2026-07-21T10:00:00+01:00',
      location: 'Clinic B',
    });

    expect(updated).toMatchObject({
      title: 'Cardiology follow-up',
      at: '2026-07-21T09:00:00.000Z',
      location: 'Clinic B',
    });
  });

  it('throws NotFound updating another family’s appointment', async () => {
    const mine = await service.create(familyId, { title: 'Mine', at: '2026-07-09T10:00:00.000Z' });
    const other = await families.create({ name: 'Costa family' });
    await expect(service.update(other.id, mine.id, { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
