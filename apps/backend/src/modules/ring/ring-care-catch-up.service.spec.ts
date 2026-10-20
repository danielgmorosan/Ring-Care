import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfig } from '../../config/env.validation';
import type { NewAlert } from '../escalation/alert.repository';
import type { AlertsService } from '../escalation/alerts.service';
import type { EscalationService, StartEscalationParams } from '../escalation/escalation.service';
import { InMemoryContactRepository } from '../escalation/in-memory-contact.repository';
import { InMemoryIncidentRepository } from '../escalation/in-memory-incident.repository';
import { InMemoryRingCareDecisionRepository } from '../escalation/ring-care/in-memory-ring-care-decision.repository';
import { RingCareService } from '../escalation/ring-care/ring-care.service';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { InMemoryVisitArrivalRepository } from '../visits/in-memory-visit-arrival.repository';
import { InMemoryVisitsRepository } from '../visits/in-memory-visits.repository';
import { VisitArrivalsService } from '../visits/visit-arrivals.service';
import { InMemoryRingRepository } from './in-memory-ring.repository';
import { RING_CATCH_UP_MIN_AGE_MS, RingCareCatchUpService } from './ring-care-catch-up.service';
import { signRingBody } from './ring-signature';
import { RingWebhookService } from './ring-webhook.service';

const SECRET = 'test-ring-hmac-secret';

/**
 * Kill mid-flow: the webhook records a night exit and the process dies before judging
 * it (the judging runs after the response). Everything durable survives (the stores
 * below stand in for Postgres); the in-process state does not. A fresh process must
 * open exactly one incident for it, however many times it is swept.
 */
describe('RingCareCatchUpService (crash between recording and judging)', () => {
  // Durable state: survives a "restart".
  let families: FamiliesService;
  let familyId: string;
  let ringRepo: InMemoryRingRepository;
  let incidents: InMemoryIncidentRepository;
  let decisions: InMemoryRingCareDecisionRepository;
  let contacts: InMemoryContactRepository;
  let visitsRepo: InMemoryVisitsRepository;
  let arrivalsRepo: InMemoryVisitArrivalRepository;
  let started: StartEscalationParams[];
  let raised: NewAlert[];

  /** A new process: fresh service instances over the same repositories. */
  function boot(): { ringCare: RingCareService; catchUp: RingCareCatchUpService } {
    const config = {
      hasTemporal: true,
      ringNightStart: '22:00',
      ringNightEnd: '07:00',
      visitArrivalGraceMinutes: 20,
    } as unknown as AppConfig;
    const escalation = {
      startEscalation: async (params: StartEscalationParams) => {
        started.push(params);
        const incidentId = `00000000-0000-4000-8000-00000000${String(5000 + started.length)}`;
        await incidents.open({
          id: incidentId,
          familyId: params.familyId,
          deviceId: params.deviceId,
          triggeringEventId: params.triggeringEventId ?? null,
          reason: params.reason,
          openedAt: new Date().toISOString(),
        });
        return { incidentId };
      },
    } as unknown as EscalationService;
    const alerts = {
      raise: async (a: NewAlert) => {
        raised.push(a);
      },
    } as unknown as AlertsService;
    const ringCare = new RingCareService(
      config,
      families,
      new VisitArrivalsService(visitsRepo, arrivalsRepo, families, config),
      escalation,
      alerts,
      incidents,
      contacts,
      decisions,
    );
    return { ringCare, catchUp: new RingCareCatchUpService(ringRepo, ringCare) };
  }

  /** Records a night exit exactly as the webhook does, then "crashes" before dispatch. */
  async function recordNightExitAndCrash(eventId: string): Promise<string> {
    const webhook = new RingWebhookService(
      { ringHmacSecret: SECRET, ringFamilyId: familyId, hasRingWebhooks: true } as AppConfig,
      ringRepo,
      new EventEmitter2(),
    );
    const body = Buffer.from(
      JSON.stringify({
        data: {
          id: eventId,
          type: 'button_press', // a doorbell: the auto-created camera is on the front door
          attributes: { timestamp: '2026-07-15T02:04:00.000Z' }, // 03:04 in Lisbon
          relationships: { device: { data: { id: 'ring-dev-front-1', type: 'devices' } } },
        },
      }),
    );
    const result = await webhook.ingest(body, signRingBody(body, SECRET), true);
    expect(result.recorded).toBe(true);
    // No webhook.dispatch(result): the process died here.
    return result.ringEventId!;
  }

  const later = () => Date.now() + RING_CATCH_UP_MIN_AGE_MS + 1_000;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    familyId = (await families.create({ name: 'Silva family', timezone: 'Europe/Lisbon' })).id;
    ringRepo = new InMemoryRingRepository();
    incidents = new InMemoryIncidentRepository();
    decisions = new InMemoryRingCareDecisionRepository();
    contacts = new InMemoryContactRepository();
    visitsRepo = new InMemoryVisitsRepository();
    arrivalsRepo = new InMemoryVisitArrivalRepository();
    started = [];
    raised = [];
  });

  it('after a restart, the sweep opens exactly one incident for the unjudged night exit', async () => {
    const ringEventId = await recordNightExitAndCrash('evt-night-1');
    expect(started).toHaveLength(0);

    const first = boot();
    expect(await first.catchUp.sweep(later())).toBe(1);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      reason: 'door.night_activity',
      triggeringEventId: ringEventId,
    });
    expect(await decisions.findByRingEvent(ringEventId)).toMatchObject({
      outcome: 'incident_opened',
    });

    // Swept again, concurrently with a late webhook dispatch, then after another restart.
    const payload = {
      familyId,
      ringCameraId: (await ringRepo.listCameras(familyId))[0]!.id,
      ringEventId,
      placement: 'front_door' as const,
      subType: null,
      occurredAt: '2026-07-15T02:04:00.000Z',
      receivedAt: new Date().toISOString(),
      source: 'simulator' as const,
    };
    await Promise.all([first.catchUp.sweep(later()), first.ringCare.onButtonPressed(payload)]);
    expect(await boot().catchUp.sweep(later())).toBe(0);
    expect(started).toHaveLength(1);
    expect(raised).toHaveLength(0);
  });

  it('a crash after the incident opened but before the decision was recorded opens no second one', async () => {
    const ringEventId = await recordNightExitAndCrash('evt-night-2');
    // The previous process got as far as opening the incident.
    await incidents.open({
      id: '00000000-0000-4000-8000-000000009999',
      familyId,
      deviceId: null,
      triggeringEventId: ringEventId,
      reason: 'door.night_activity',
      openedAt: new Date().toISOString(),
    });

    expect(await boot().catchUp.sweep(later())).toBe(1);
    expect(started).toHaveLength(0);
    expect(await decisions.findByRingEvent(ringEventId)).toMatchObject({
      outcome: 'incident_opened',
      incidentId: '00000000-0000-4000-8000-000000009999',
    });
  });

  it('leaves events older than the window, and fresh ones the webhook is still judging', async () => {
    await recordNightExitAndCrash('evt-night-3');
    const { catchUp } = boot();
    expect(await catchUp.sweep(Date.now())).toBe(0); // too fresh
    expect(await catchUp.sweep(Date.now() + 31 * 60_000)).toBe(0); // too old
    expect(started).toHaveLength(0);
  });
});
