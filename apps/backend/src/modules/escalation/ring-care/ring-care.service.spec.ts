import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfig } from '../../../config/env.validation';
import type { RingActivityPayload } from '../../../internal-events/internal-events';
import { FamiliesService } from '../../families/families.service';
import { InMemoryFamilyRepository } from '../../families/in-memory-family.repository';
import { InMemoryVisitArrivalRepository } from '../../visits/in-memory-visit-arrival.repository';
import { InMemoryVisitsRepository } from '../../visits/in-memory-visits.repository';
import { VisitArrivalsService } from '../../visits/visit-arrivals.service';
import type { NewAlert } from '../alert.repository';
import type { AlertsService } from '../alerts.service';
import type { EscalationService, StartEscalationParams } from '../escalation.service';
import { InMemoryContactRepository } from '../in-memory-contact.repository';
import { InMemoryIncidentRepository } from '../in-memory-incident.repository';
import type { EscalationContact } from '../temporal/types';
import { InMemoryRingCareDecisionRepository } from './in-memory-ring-care-decision.repository';
import { NIGHT_DOOR_DEDUPE_MINUTES, RingCareService } from './ring-care.service';

// Mid-July: Lisbon is UTC+1, so 02:04Z is 03:04 on Dad's clock.
const NIGHT = '2026-07-15T02:04:00.000Z';
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const contact = (
  id: string,
  name: string,
  role: string,
  priority: number,
  quietHours: EscalationContact['quietHours'] = null,
): EscalationContact => ({
  id,
  name,
  role,
  phone: `+35191000000${priority}`,
  pushToken: null,
  priority,
  quietHours,
});

describe('RingCareService', () => {
  let families: FamiliesService;
  let familyId: string;
  let visitsRepo: InMemoryVisitsRepository;
  let arrivalsRepo: InMemoryVisitArrivalRepository;
  let incidents: InMemoryIncidentRepository;
  let contacts: InMemoryContactRepository;
  let decisions: InMemoryRingCareDecisionRepository;
  let started: StartEscalationParams[];
  let raised: NewAlert[];
  let startFails: boolean;
  let config: { hasTemporal: boolean; ringNightStart: string; ringNightEnd: string };
  let service: RingCareService;
  let seq: number;

  function event(over: Partial<RingActivityPayload> = {}): RingActivityPayload {
    return {
      familyId,
      ringCameraId: ID(900),
      ringEventId: ID(++seq),
      placement: 'front_door',
      subType: 'human',
      occurredAt: NIGHT,
      source: 'simulator',
      ...over,
    };
  }

  function build(): RingCareService {
    const visitArrivals = new VisitArrivalsService(visitsRepo, arrivalsRepo, families, {
      visitArrivalGraceMinutes: 20,
    } as AppConfig);
    let incidentSeq = 0;
    const escalation = {
      startEscalation: async (params: StartEscalationParams) => {
        if (startFails) throw new Error('temporal unavailable');
        started.push(params);
        const incidentId = ID(5000 + ++incidentSeq);
        await incidents.open({
          id: incidentId,
          familyId: params.familyId,
          deviceId: params.deviceId,
          triggeringEventId: params.triggeringEventId ?? null,
          reason: params.reason,
          openedAt: NIGHT,
        });
        return { incidentId };
      },
    } as unknown as EscalationService;
    const alerts = {
      raise: async (alert: NewAlert) => {
        raised.push(alert);
      },
    } as unknown as AlertsService;
    return new RingCareService(
      config as unknown as AppConfig,
      families,
      visitArrivals,
      escalation,
      alerts,
      incidents,
      contacts,
      decisions,
    );
  }

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    familyId = (await families.create({ name: 'Silva family', timezone: 'Europe/Lisbon' })).id;
    visitsRepo = new InMemoryVisitsRepository();
    arrivalsRepo = new InMemoryVisitArrivalRepository();
    incidents = new InMemoryIncidentRepository();
    contacts = new InMemoryContactRepository();
    contacts.set(familyId, [
      contact(ID(101), 'Sofia', 'daughter', 0),
      contact(ID(102), 'Miguel', 'son', 1),
    ]);
    decisions = new InMemoryRingCareDecisionRepository();
    started = [];
    raised = [];
    startFails = false;
    seq = 0;
    config = { hasTemporal: true, ringNightStart: '22:00', ringNightEnd: '07:00' };
    service = build();
  });

  describe('night door activity', () => {
    it('opens a family-only door.night_activity incident at 03:04 (the hero scene)', async () => {
      const e = event();
      await service.onMotion(e);

      expect(started).toHaveLength(1);
      expect(started[0]).toEqual({
        familyId,
        deviceId: null,
        reason: 'door.night_activity',
        triggeringEventId: e.ringEventId,
        confirmedFall: false,
        messages: {
          device: "Someone was at the front door at 3:04. We're calling Sofia now.",
          unanswered:
            "Someone was at the front door at 3:04. We haven't reached anyone by phone yet. Please check on home.",
        },
      });
      expect(await service.interpretRingEvent(e.ringEventId)).toBe('night_door');
      expect(raised).toEqual([]); // the ladder alerts; no duplicate alert
    });

    it('treats a doorbell press at night the same way, with its own words', async () => {
      await service.onButtonPressed(event({ subType: null }));

      expect(started).toHaveLength(1);
      expect(started[0]!.messages!.device).toBe(
        "Someone rang the front doorbell at 3:04. We're calling Sofia now.",
      );
    });

    it('names the first contact quiet hours will not skip', async () => {
      contacts.set(familyId, [
        contact(ID(101), 'Sofia', 'daughter', 0, {
          start: '00:00',
          end: '23:59',
          wakeForConfirmedFallOnly: true,
        }),
        contact(ID(102), 'Miguel', 'son', 1),
      ]);
      await service.onMotion(event());
      expect(started[0]!.messages!.device).toContain("We're calling Miguel now.");
    });

    it('evaluates the night window in the household timezone, across midnight', async () => {
      const at = async (iso: string): Promise<boolean> => {
        const before = started.length;
        // Events are hours apart and each incident is settled, so each is judged alone.
        await service.onMotion(event({ occurredAt: iso }));
        if (started.length === before) return false;
        await incidents.appendStep({
          incidentId: ID(5000 + started.length),
          seq: 0,
          kind: 'call_answered',
          contactId: null,
          detail: {},
        });
        return true;
      };
      // Lisbon is UTC+1 in July.
      expect(await at('2026-07-15T20:59:00.000Z')).toBe(false); // 21:59 local
      expect(await at('2026-07-15T21:00:00.000Z')).toBe(true); // 22:00 local
      expect(await at('2026-07-15T22:30:00.000Z')).toBe(true); // 23:30 local
      expect(await at('2026-07-16T05:59:00.000Z')).toBe(true); // 06:59 local
      expect(await at('2026-07-16T06:00:00.000Z')).toBe(false); // 07:00 local
    });

    it('the same instant can be night in one household and day in another', async () => {
      // 06:30Z is 07:30 in Lisbon (day) but 02:30 in New York (night).
      await service.onMotion(event({ occurredAt: '2026-07-15T06:30:00.000Z' }));
      expect(started).toHaveLength(0);

      const ny = await families.create({ name: 'Costa family', timezone: 'America/New_York' });
      await service.onMotion(event({ familyId: ny.id, occurredAt: '2026-07-15T06:30:00.000Z' }));
      expect(started).toHaveLength(1);
      expect(started[0]!.familyId).toBe(ny.id);
    });

    it('joins repeated motion within a few minutes instead of opening new incidents', async () => {
      const first = event();
      const again = event({ occurredAt: '2026-07-15T02:07:00.000Z' });
      const ding = event({ occurredAt: '2026-07-15T02:08:00.000Z' });
      await service.onMotion(first);
      await service.onMotion(again);
      await service.onButtonPressed(ding);

      expect(started).toHaveLength(1);
      const joined = await decisions.findByRingEvent(again.ringEventId);
      expect(joined).toMatchObject({ outcome: 'joined_incident', incidentId: ID(5001) });
      expect(await service.interpretRingEvent(ding.ringEventId)).toBe('night_door');
    });

    it('opens one incident when a motion and a ding arrive at the same moment', async () => {
      await Promise.all([service.onMotion(event()), service.onButtonPressed(event())]);
      expect(started).toHaveLength(1);
    });

    it('joins while the incident is still running, even past the de-dup window', async () => {
      await service.onMotion(event());
      const later = new Date(
        Date.parse(NIGHT) + (NIGHT_DOOR_DEDUPE_MINUTES + 20) * 60_000,
      ).toISOString();

      await service.onMotion(event({ occurredAt: later }));
      expect(started).toHaveLength(1); // incident 5001 has no terminal step yet

      // Miguel answered: the incident is settled. Fresh activity later is a new incident.
      await incidents.appendStep({
        incidentId: ID(5001),
        seq: 0,
        kind: 'call_answered',
        contactId: ID(102),
        detail: {},
      });
      const muchLater = new Date(Date.parse(later) + 60 * 60_000).toISOString();
      await service.onMotion(event({ occurredAt: muchLater }));
      expect(started).toHaveLength(2);
    });

    it('judges a redelivered Ring event once', async () => {
      const e = event();
      await service.onMotion(e);
      await service.onMotion(e);
      expect(started).toHaveLength(1);
    });

    it.each(['vehicle', 'package_delivery', 'other_motion', 'motion', null])(
      'does not open an incident for %s motion',
      async (subType) => {
        const e = event({ subType });
        await service.onMotion(e);
        expect(started).toHaveLength(0);
        expect(raised).toHaveLength(0);
        expect(await service.interpretRingEvent(e.ringEventId)).toBeNull();
        expect((await decisions.findByRingEvent(e.ringEventId))?.outcome).toBe('not_a_person');
      },
    );

    it('ignores cameras that are not on the front door', async () => {
      await service.onMotion(event({ placement: 'indoor' }));
      await service.onButtonPressed(event({ placement: 'other' }));
      expect(started).toHaveLength(0);
    });

    it('daytime front-door motion only lands on the timeline', async () => {
      const e = event({ occurredAt: '2026-07-15T13:00:00.000Z' });
      await service.onMotion(e);
      expect(started).toHaveLength(0);
      expect(raised).toHaveLength(0);
      expect(await service.interpretRingEvent(e.ringEventId)).toBeNull();
      expect((await decisions.findByRingEvent(e.ringEventId))?.outcome).toBe('daytime');
    });

    it('does not open an incident during an expected night visit', async () => {
      await visitsRepo.create({
        familyId,
        visitorLabel: 'Night carer',
        startsAt: '2026-07-15T01:00:00.000Z',
        endsAt: '2026-07-15T05:00:00.000Z',
        notes: null,
      });
      const arrival = event();
      const later = event({ occurredAt: '2026-07-15T03:00:00.000Z' });
      await service.onMotion(arrival);
      await service.onMotion(later);

      expect(started).toHaveLength(0);
      expect(await service.interpretRingEvent(arrival.ringEventId)).toBe('visit_arrival');
      expect((await decisions.findByRingEvent(later.ringEventId))?.outcome).toBe('during_visit');
    });

    it('alerts the family without calls when the escalation engine is not configured', async () => {
      config.hasTemporal = false;
      const e = event();
      await service.onMotion(e);

      expect(started).toHaveLength(0);
      expect(raised).toEqual([
        {
          familyId,
          deviceId: null,
          kind: 'door.night_activity',
          message: 'Someone was at the front door at 3:04. Open the app to take a look.',
          ref: e.ringEventId,
          at: NIGHT,
        },
      ]);
      expect(await service.interpretRingEvent(e.ringEventId)).toBe('night_door');

      // Repeated motion still joins rather than alerting again.
      await service.onMotion(event({ occurredAt: '2026-07-15T02:06:00.000Z' }));
      expect(raised).toHaveLength(1);
    });

    it('falls back to a family alert when the ladder fails to start', async () => {
      startFails = true;
      await service.onMotion(event());
      expect(raised).toHaveLength(1);
      expect(raised[0]!.kind).toBe('door.night_activity');
    });

    it('never throws back into the Ring intake path', async () => {
      await expect(
        service.onMotion(event({ familyId: ID(424242) })), // unknown family
      ).resolves.toBeUndefined();
      expect(started).toHaveLength(0);
    });
  });

  describe('visit arrival', () => {
    let annaId: string;

    beforeEach(async () => {
      // Anna, expected 09:00 to 10:00 Lisbon (08:00Z to 09:00Z in July).
      annaId = (
        await visitsRepo.create({
          familyId,
          visitorLabel: 'Anna',
          startsAt: '2026-07-15T08:00:00.000Z',
          endsAt: '2026-07-15T09:00:00.000Z',
          notes: null,
        })
      ).id;
    });

    it('a doorbell press at 09:02 records that Anna arrived', async () => {
      const ding = event({ subType: null, occurredAt: '2026-07-15T08:02:00.000Z' });
      await service.onButtonPressed(ding);

      expect(await arrivalsRepo.findByVisit(annaId)).toMatchObject({
        visitId: annaId,
        familyId,
        ringEventId: ding.ringEventId,
        visitorLabel: 'Anna',
        arrivedAt: '2026-07-15T08:02:00.000Z',
      });
      expect(await service.interpretRingEvent(ding.ringEventId)).toBe('visit_arrival');
      expect(started).toHaveLength(0);
    });

    it('human motion counts too, and only the first one is the arrival', async () => {
      const motion = event({ occurredAt: '2026-07-15T08:01:00.000Z' });
      const ding = event({ subType: null, occurredAt: '2026-07-15T08:02:00.000Z' });
      await service.onMotion(motion);
      await service.onButtonPressed(ding);

      expect((await arrivalsRepo.findByVisit(annaId))?.ringEventId).toBe(motion.ringEventId);
      expect(await arrivalsRepo.listByFamily(familyId)).toHaveLength(1);
      expect(await service.interpretRingEvent(ding.ringEventId)).toBeNull();
    });

    it('a carer a few minutes early still counts as arrived', async () => {
      await service.onButtonPressed(event({ occurredAt: '2026-07-15T07:50:00.000Z' }));
      expect(await arrivalsRepo.findByVisit(annaId)).not.toBeNull();
    });

    it('a package delivery during the window is not an arrival', async () => {
      await service.onMotion(
        event({ subType: 'package_delivery', occurredAt: '2026-07-15T08:05:00.000Z' }),
      );
      expect(await arrivalsRepo.findByVisit(annaId)).toBeNull();
    });

    it('activity outside the window is not an arrival', async () => {
      await service.onButtonPressed(event({ occurredAt: '2026-07-15T11:00:00.000Z' }));
      expect(await arrivalsRepo.findByVisit(annaId)).toBeNull();
    });
  });
});
