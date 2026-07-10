import { EventEmitter2 } from '@nestjs/event-emitter';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import type { DevicesService } from '../devices/devices.service';
import { InMemoryVisitsRepository } from '../visits/in-memory-visits.repository';
import { VisitsService } from '../visits/visits.service';
import type { NewAlert } from './alert.repository';
import type { AlertsService } from './alerts.service';
import { InMemoryIncidentRepository } from './in-memory-incident.repository';
import { InMemorySightingRepository } from './in-memory-sighting.repository';
import { StrangerEvaluatorService } from './stranger-evaluator.service';

const DEVICE = 'device-1';
const SEEN_AT = '2026-07-09T15:00:00.000Z';
// A visit window covering SEEN_AT.
const VISIT_START = '2026-07-09T14:00:00.000Z';
const VISIT_END = '2026-07-09T17:00:00.000Z';

function personUnknown(overrides: { uniformed?: boolean; eventId?: string } = {}) {
  return {
    deviceId: DEVICE,
    eventId: overrides.eventId ?? 'evt-1',
    occurredAt: SEEN_AT,
    uniformed: overrides.uniformed ?? false,
  };
}

describe('StrangerEvaluatorService', () => {
  let evaluator: StrangerEvaluatorService;
  let families: FamiliesService;
  let visits: VisitsService;
  let incidents: InMemoryIncidentRepository;
  let sightings: InMemorySightingRepository;
  let familyId: string;
  let raised: NewAlert[];

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    familyId = (await families.create({ name: 'Silva family' })).id;
    visits = new VisitsService(new InMemoryVisitsRepository(), families);
    incidents = new InMemoryIncidentRepository();
    sightings = new InMemorySightingRepository();
    raised = [];
    const devices = {
      findById: async (id: string) => (id === DEVICE ? { id: DEVICE, familyId } : null),
    } as unknown as DevicesService;
    const alerts = {
      raise: async (alert: NewAlert) => {
        raised.push(alert);
      },
    } as unknown as AlertsService;
    evaluator = new StrangerEvaluatorService(devices, visits, alerts, incidents, sightings);
  });

  // Seed an incident that reached the emergency-notified step, opened at `openedAt`.
  async function seedEmergency(openedAt: string): Promise<void> {
    await incidents.open({
      id: `inc-${openedAt}`,
      familyId,
      deviceId: DEVICE,
      triggeringEventId: 'fall-1',
      reason: 'fall.confirmed',
      openedAt,
    });
    await incidents.appendStep({
      incidentId: `inc-${openedAt}`,
      seq: 1,
      kind: 'emergency_notified',
      contactId: null,
      detail: {},
    });
  }

  it('treats an unknown person as expected during a recent system-initiated emergency', async () => {
    await seedEmergency('2026-07-09T14:30:00.000Z'); // 30 min before the sighting

    await evaluator.onPersonUnknown(personUnknown({ uniformed: true }));

    const [record] = await sightings.listByFamily(familyId);
    expect(record).toMatchObject({
      decision: 'expected',
      reason: 'system_emergency',
      uniformed: true,
      visitLabel: null,
    });
  });

  it('treats an unknown person as expected when a pre-logged visit covers the moment', async () => {
    await visits.create(familyId, {
      visitorLabel: 'Nurse',
      startsAt: VISIT_START,
      endsAt: VISIT_END,
    });

    await evaluator.onPersonUnknown(personUnknown());

    const [record] = await sightings.listByFamily(familyId);
    expect(record).toMatchObject({
      decision: 'expected',
      reason: 'expected_visit',
      visitLabel: 'Nurse',
    });
  });

  it('RULE #5: a uniform never grants trust — a uniformed unknown with no emergency and no visit is a stranger', async () => {
    await evaluator.onPersonUnknown(personUnknown({ uniformed: true }));

    const [record] = await sightings.listByFamily(familyId);
    expect(record).toMatchObject({ decision: 'stranger', reason: 'none', uniformed: true });
  });

  it('a plain unknown person with no context is a stranger', async () => {
    await evaluator.onPersonUnknown(personUnknown());

    const [record] = await sightings.listByFamily(familyId);
    expect(record).toMatchObject({ decision: 'stranger', reason: 'none', uniformed: false });
  });

  it('an emergency older than the expectation window does NOT suppress the alarm', async () => {
    await seedEmergency('2026-07-09T12:00:00.000Z'); // 3h before — past the 2h window

    await evaluator.onPersonUnknown(personUnknown({ uniformed: true }));

    const [record] = await sightings.listByFamily(familyId);
    expect(record?.decision).toBe('stranger');
  });

  it('records nothing for an unregistered device, and does not throw', async () => {
    await evaluator.onPersonUnknown({ ...personUnknown(), deviceId: 'ghost-device' });

    expect(await sightings.listByFamily(familyId)).toHaveLength(0);
  });

  it('is idempotent on the event id — a replayed sighting records once', async () => {
    await evaluator.onPersonUnknown(personUnknown({ eventId: 'evt-dup' }));
    await evaluator.onPersonUnknown(personUnknown({ eventId: 'evt-dup' }));

    expect(await sightings.listByFamily(familyId)).toHaveLength(1);
  });

  it('never throws out of the handler even when a dependency fails', async () => {
    const boom = {
      findById: async () => {
        throw new Error('db down');
      },
    } as unknown as DevicesService;
    const guarded = new StrangerEvaluatorService(
      boom,
      visits,
      { raise: async () => undefined } as unknown as AlertsService,
      incidents,
      sightings,
    );

    await expect(guarded.onPersonUnknown(personUnknown())).resolves.toBeUndefined();
  });

  it('raises a stranger alert with the plain message', async () => {
    await evaluator.onPersonUnknown(personUnknown());

    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      familyId,
      deviceId: DEVICE,
      kind: 'stranger',
      message: 'Someone we do not recognize is at the home. Open the app to take a look.',
      ref: 'evt-1',
    });
  });

  it('names the uniform as plain context in the stranger alert', async () => {
    await evaluator.onPersonUnknown(personUnknown({ uniformed: true }));

    expect(raised[0]!.message).toContain('appear to be in a uniform');
  });

  it('does not alert the family when the person was expected', async () => {
    await visits.create(familyId, {
      visitorLabel: 'Nurse',
      startsAt: VISIT_START,
      endsAt: VISIT_END,
    });

    await evaluator.onPersonUnknown(personUnknown({ uniformed: true }));

    expect(raised).toHaveLength(0);
  });
});
