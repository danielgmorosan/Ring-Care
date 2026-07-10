import { EventEmitter2 } from '@nestjs/event-emitter';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { AppointmentsService } from './appointments.service';
import { CareService } from './care.service';
import { InMemoryAppointmentRepository } from './in-memory-appointment.repository';
import { InMemoryMedicationRepository } from './in-memory-medication.repository';
import { MedicationsService } from './medications.service';

const DAY = '2026-07-09';

describe('CareService (today view)', () => {
  let care: CareService;
  let medications: MedicationsService;
  let appointments: AppointmentsService;
  let families: FamiliesService;
  let familyId: string;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    medications = new MedicationsService(new InMemoryMedicationRepository(), families);
    appointments = new AppointmentsService(new InMemoryAppointmentRepository(), families);
    care = new CareService(medications, appointments, families);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  it('returns the full medication schedule and only today’s appointments', async () => {
    await medications.create(familyId, { name: 'Bisoprolol', times: ['08:00'] });
    await appointments.create(familyId, { title: 'Today visit', at: `${DAY}T10:00:00.000Z` });
    await appointments.create(familyId, { title: 'Next week', at: '2026-07-16T10:00:00.000Z' });

    const today = await care.today(familyId, DAY);

    expect(today.date).toBe(DAY);
    expect(today.medications.map((m) => m.name)).toEqual(['Bisoprolol']);
    expect(today.appointments.map((a) => a.title)).toEqual(['Today visit']);
  });

  it('is calm on an empty day', async () => {
    const today = await care.today(familyId, DAY);
    expect(today).toMatchObject({ date: DAY, medications: [], appointments: [] });
  });

  it('buckets appointments by the family’s local day, not UTC', async () => {
    // Auckland is UTC+12/+13: 22:00 UTC on the 8th is already the 9th locally.
    const nz = (await families.create({ name: 'Kiwi family', timezone: 'Pacific/Auckland' })).id;
    await appointments.create(nz, { title: 'Late UTC', at: '2026-07-08T22:00:00.000Z' });

    // Not on the UTC 8th...
    expect((await care.today(nz, '2026-07-08')).appointments).toHaveLength(0);
    // ...but on the local 9th.
    const local = await care.today(nz, '2026-07-09');
    expect(local.appointments.map((a) => a.title)).toEqual(['Late UTC']);
  });
});
