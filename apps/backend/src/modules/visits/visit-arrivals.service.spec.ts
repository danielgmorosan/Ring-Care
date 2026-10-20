import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfig } from '../../config/env.validation';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { InMemoryVisitArrivalRepository } from './in-memory-visit-arrival.repository';
import { InMemoryVisitsRepository } from './in-memory-visits.repository';
import { VisitArrivalsService } from './visit-arrivals.service';

const RING_A = '00000000-0000-4000-8000-00000000e001';
const RING_B = '00000000-0000-4000-8000-00000000e002';

describe('VisitArrivalsService', () => {
  let families: FamiliesService;
  let familyId: string;
  let visits: InMemoryVisitsRepository;
  let service: VisitArrivalsService;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    familyId = (await families.create({ name: 'Silva family', timezone: 'Europe/Lisbon' })).id;
    visits = new InMemoryVisitsRepository();
    service = new VisitArrivalsService(visits, new InMemoryVisitArrivalRepository(), families, {
      visitArrivalGraceMinutes: 20,
    } as AppConfig);
  });

  const anna = () =>
    visits.create({
      familyId,
      visitorLabel: 'Anna',
      startsAt: '2026-07-15T08:00:00.000Z',
      endsAt: '2026-07-15T09:00:00.000Z',
      notes: null,
    });

  it('records one arrival per visit; a second is a no-op', async () => {
    const visit = await anna();
    expect(await service.record(visit, RING_A, '2026-07-15T08:02:00.000Z')).toBe(true);
    expect(await service.record(visit, RING_B, '2026-07-15T08:03:00.000Z')).toBe(false);
    expect((await service.findByVisit(visit.id))?.ringEventId).toBe(RING_A);
  });

  it('keeps the label it arrived under even if the visit is renamed or deleted later', async () => {
    const visit = await anna();
    await service.record(visit, RING_A, '2026-07-15T08:02:00.000Z');
    await visits.update(familyId, visit.id, { visitorLabel: 'Someone else' });
    await visits.delete(familyId, visit.id);

    const [arrival] = await service.listForFamily(familyId);
    expect(arrival).toMatchObject({ visitorLabel: 'Anna', text: 'Anna arrived at 9:02.' });
  });

  it('finds visits in their arrival window, including a few minutes early', async () => {
    await anna();
    expect(await service.inArrivalWindow(familyId, '2026-07-15T07:44:00.000Z')).toHaveLength(0);
    expect(await service.inArrivalWindow(familyId, '2026-07-15T07:45:00.000Z')).toHaveLength(1);
    expect(await service.inArrivalWindow(familyId, '2026-07-15T09:00:00.000Z')).toHaveLength(1);
    expect(await service.inArrivalWindow(familyId, '2026-07-15T09:01:00.000Z')).toHaveLength(0);
  });

  it('lists visits past start + grace without an arrival', async () => {
    const visit = await anna();
    expect(await service.dueWithoutArrival(familyId, Date.parse('2026-07-15T08:19:59Z'))).toEqual(
      [],
    );
    expect(
      (await service.dueWithoutArrival(familyId, Date.parse('2026-07-15T08:20:00Z'))).map(
        (v) => v.id,
      ),
    ).toEqual([visit.id]);
    await service.record(visit, RING_A, '2026-07-15T08:21:00.000Z');
    expect(await service.dueWithoutArrival(familyId, Date.parse('2026-07-15T08:22:00Z'))).toEqual(
      [],
    );
  });
});
