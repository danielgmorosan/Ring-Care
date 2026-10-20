import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfig } from '../../../config/env.validation';
import { FamiliesService } from '../../families/families.service';
import { InMemoryFamilyRepository } from '../../families/in-memory-family.repository';
import type { PushTokensService } from '../../push/push-tokens.service';
import { InMemoryVisitArrivalRepository } from '../../visits/in-memory-visit-arrival.repository';
import { InMemoryVisitsRepository } from '../../visits/in-memory-visits.repository';
import { VisitArrivalsService } from '../../visits/visit-arrivals.service';
import { AlertsService } from '../alerts.service';
import { InMemoryAlertRepository } from '../in-memory-alert.repository';
import type { PushPort } from '../notifications/push.port';
import type { DeviceAlertInput } from '../temporal/types';
import { VisitNoShowSweepService } from './visit-no-show-sweep.service';

// Anna is expected 09:00 to 10:00 Lisbon on a July day (08:00Z to 09:00Z).
const START = '2026-07-15T08:00:00.000Z';
const END = '2026-07-15T09:00:00.000Z';
const at = (hhmmUtc: string): number => Date.parse(`2026-07-15T${hhmmUtc}:00.000Z`);
const RING_EVENT = '00000000-0000-4000-8000-00000000e001';

describe('VisitNoShowSweepService', () => {
  let families: FamiliesService;
  let familyId: string;
  let visitsRepo: InMemoryVisitsRepository;
  let arrivalsRepo: InMemoryVisitArrivalRepository;
  let alertRepo: InMemoryAlertRepository;
  let pushed: DeviceAlertInput[];
  let config: { ringFamilyId: string | undefined; visitArrivalGraceMinutes: number };
  let visitArrivals: VisitArrivalsService;

  /** A fresh service over the same durable stores: what a process restart looks like. */
  function boot(): VisitNoShowSweepService {
    const pushTokens = {
      listForFamily: async () => [{ token: 'caregiver-phone' }],
    } as unknown as PushTokensService;
    const push = {
      pushToDevice: async (input: DeviceAlertInput) => {
        pushed.push(input);
      },
    } as unknown as PushPort;
    const alerts = new AlertsService(alertRepo, pushTokens, push);
    visitArrivals = new VisitArrivalsService(
      visitsRepo,
      arrivalsRepo,
      families,
      config as unknown as AppConfig,
    );
    return new VisitNoShowSweepService(
      config as unknown as AppConfig,
      families,
      visitArrivals,
      alerts,
    );
  }

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    familyId = (await families.create({ name: 'Silva family', timezone: 'Europe/Lisbon' })).id;
    visitsRepo = new InMemoryVisitsRepository();
    arrivalsRepo = new InMemoryVisitArrivalRepository();
    alertRepo = new InMemoryAlertRepository();
    pushed = [];
    config = { ringFamilyId: familyId, visitArrivalGraceMinutes: 20 };
  });

  async function anna() {
    return visitsRepo.create({
      familyId,
      visitorLabel: 'Anna',
      startsAt: START,
      endsAt: END,
      notes: null,
    });
  }

  it('tells the family when Anna has not arrived by 09:20', async () => {
    const visit = await anna();
    const sweep = boot();

    await sweep.sweep(at('08:19'));
    expect(await alertRepo.listByFamily(familyId)).toHaveLength(0); // 09:19 local: not yet

    await sweep.sweep(at('08:20'));
    const alerts = await alertRepo.listByFamily(familyId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      familyId,
      deviceId: null,
      kind: 'visit.no_show',
      message: "Anna was expected at 9:00 and hasn't arrived yet. Open the app to check in.",
      ref: visit.id,
      at: '2026-07-15T08:20:00.000Z',
    });
    expect(pushed.map((p) => p.message)).toEqual([alerts[0]!.message]);
  });

  it('stays quiet when Anna arrived', async () => {
    const visit = await anna();
    const sweep = boot();
    await visitArrivals.record(visit, RING_EVENT, '2026-07-15T08:02:00.000Z');

    await sweep.sweep(at('08:30'));
    expect(await alertRepo.listByFamily(familyId)).toHaveLength(0);
  });

  it('alerts once per visit, across passes and across a restart', async () => {
    await anna();
    await boot().sweep(at('08:20'));
    await boot().sweep(at('08:21')); // restarted process, same Postgres state
    await boot().sweep(at('08:40'));

    expect(await alertRepo.listByFamily(familyId)).toHaveLength(1);
    expect(pushed).toHaveLength(1);
  });

  it('a restart during the wait still fires the overdue alert', async () => {
    await anna();
    await boot().sweep(at('08:10')); // before the grace period ends
    // The process dies and comes back long after 09:20.
    await boot().sweep(at('09:30'));
    expect(await alertRepo.listByFamily(familyId)).toHaveLength(1);
  });

  it('does not announce visits from long ago', async () => {
    await anna();
    await boot().sweep(Date.parse('2026-07-16T08:00:00.000Z'));
    expect(await alertRepo.listByFamily(familyId)).toHaveLength(0);
  });

  it('only sweeps the Ring-linked household', async () => {
    await anna();
    config.ringFamilyId = undefined;
    await boot().sweep(at('08:30'));
    expect(await alertRepo.listByFamily(familyId)).toHaveLength(0);
  });

  it('a late arrival after the alert is still recorded and the alert is not repeated', async () => {
    const visit = await anna();
    await boot().sweep(at('08:20'));
    expect(await visitArrivals.record(visit, RING_EVENT, '2026-07-15T08:25:00.000Z')).toBe(true);
    await boot().sweep(at('08:30'));
    expect(await alertRepo.listByFamily(familyId)).toHaveLength(1);
  });
});
