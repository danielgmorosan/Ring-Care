import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { EventType, type EventEnvelope } from '@obrigada/shared';
import { EventsService } from '../events/events.service';
import { InMemoryEventStreamRepository } from '../events/in-memory-event-stream.repository';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { IncidentsQueryService } from './incidents-query.service';
import { InMemoryIncidentRepository } from './in-memory-incident.repository';
import type { Incident } from './incident.repository';
import type { IncidentStepKind } from './temporal/types';
import { NarrationService } from './narration/narration.service';
import { MockNarrationAdapter } from './narration/mock-narration.adapter';
import { InMemoryNarrativeRepository } from './narration/in-memory-narrative.repository';

const DEVICE = '00000000-0000-4000-8000-0000000000d0';

describe('IncidentsQueryService', () => {
  let repo: InMemoryIncidentRepository;
  let service: IncidentsQueryService;
  let families: FamiliesService;
  let events: EventsService;
  let familyId: string;

  function incident(over: Partial<Incident> & Pick<Incident, 'id' | 'openedAt'>): Incident {
    return {
      familyId,
      deviceId: DEVICE,
      triggeringEventId: null,
      reason: 'fall.suspected',
      ...over,
    };
  }

  async function seedSteps(incidentId: string, kinds: IncidentStepKind[]): Promise<void> {
    for (let seq = 0; seq < kinds.length; seq++) {
      await repo.appendStep({ incidentId, seq, kind: kinds[seq]!, contactId: null, detail: {} });
    }
  }

  beforeEach(async () => {
    repo = new InMemoryIncidentRepository();
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    const mock = new MockNarrationAdapter();
    const narration = new NarrationService(mock, new InMemoryNarrativeRepository(), mock);
    events = new EventsService(new InMemoryEventStreamRepository(), new EventEmitter2());
    service = new IncidentsQueryService(repo, families, narration, events);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  // Ingest a vlm.verdict about a flagged event, as the device would.
  async function ingestVerdict(
    aboutEventId: string,
    payload: Record<string, unknown>,
    confidence = 0.86,
  ): Promise<void> {
    await events.ingest({
      eventId: '22222222-2222-4222-8222-222222222222',
      deviceId: DEVICE,
      type: EventType.VlmVerdict,
      occurredAt: '2026-07-05T10:00:05.000Z',
      confidence,
      payload: { aboutEventId, ...payload },
    } as EventEnvelope);
  }

  it('lists incidents newest first with derived outcome and step count', async () => {
    await repo.open(incident({ id: 'inc-old', openedAt: '2026-07-01T10:00:00.000Z' }));
    await seedSteps('inc-old', ['incident_opened', 'voice_checkin_result', 'stood_down']);
    await repo.open(incident({ id: 'inc-new', openedAt: '2026-07-05T10:00:00.000Z' }));
    await seedSteps('inc-new', ['incident_opened', 'call_placed', 'call_answered']);

    const list = await service.listForFamily(familyId);

    expect(list.map((i) => i.id)).toEqual(['inc-new', 'inc-old']); // opened_at DESC
    expect(list[0]).toMatchObject({ outcome: 'acknowledged', stepCount: 3 });
    expect(list[1]).toMatchObject({ outcome: 'stood_down', stepCount: 3 });
  });

  it('derives emergency_notified and active outcomes', async () => {
    await repo.open(incident({ id: 'inc-911', openedAt: '2026-07-05T10:00:00.000Z' }));
    await seedSteps('inc-911', ['incident_opened', 'call_no_answer', 'emergency_notified']);
    await repo.open(incident({ id: 'inc-open', openedAt: '2026-07-05T11:00:00.000Z' }));
    await seedSteps('inc-open', ['incident_opened']);

    const byId = new Map((await service.listForFamily(familyId)).map((i) => [i.id, i]));
    expect(byId.get('inc-911')!.outcome).toBe('emergency_notified');
    expect(byId.get('inc-open')!.outcome).toBe('active');
  });

  it('returns full ordered steps in the detail view', async () => {
    await repo.open(incident({ id: 'inc-1', openedAt: '2026-07-05T10:00:00.000Z' }));
    await seedSteps('inc-1', ['incident_opened', 'call_placed', 'stood_down']);

    const detail = await service.detailForFamily(familyId, 'inc-1');

    expect(detail.outcome).toBe('stood_down');
    expect(detail.narrative).toContain('All is well.');
    expect(detail.steps.map((s) => s.kind)).toEqual([
      'incident_opened',
      'call_placed',
      'stood_down',
    ]);
    expect(detail.steps[0]).toMatchObject({ seq: 0, contactName: null, occurredAt: null });
  });

  it('hides another family incident behind a 404 (never cross-family)', async () => {
    const other = await families.create({ name: 'Costa family' });
    await repo.open({
      id: 'inc-other',
      familyId: other.id,
      deviceId: '00000000-0000-4000-8000-0000000000d1',
      triggeringEventId: null,
      reason: 'fall.suspected',
      openedAt: '2026-07-05T10:00:00.000Z',
    });

    expect(await service.listForFamily(familyId)).toHaveLength(0);
    await expect(service.detailForFamily(familyId, 'inc-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('shows a Ring night door incident: family-level, labelled, family_alerted (0011)', async () => {
    await repo.open(
      incident({
        id: 'inc-door',
        openedAt: '2026-07-15T02:04:00.000Z',
        deviceId: null,
        reason: 'door.night_activity',
        triggeringEventId: '33333333-3333-4333-8333-333333333333',
      }),
    );
    await seedSteps('inc-door', [
      'incident_opened',
      'push_sent',
      'call_placed',
      'call_no_answer',
      'sms_sent',
      'family_alerted',
    ]);

    const [summary] = await service.listForFamily(familyId);
    expect(summary).toMatchObject({
      reason: 'door.night_activity',
      label: 'Front door at night',
      outcome: 'family_alerted',
    });

    const detail = await service.detailForFamily(familyId, 'inc-door');
    expect(detail.label).toBe('Front door at night');
    expect(detail.secondOpinion).toBeNull(); // no guardian, no VLM
    expect(detail.narrative).toContain('Someone was at the front door in the night');
    expect(detail.narrative).toContain('We texted and alerted everyone on your contact list.');
    expect(detail.narrative).not.toContain('emergency');
    expect(detail.narrative).not.toMatch(/[\u2014!]/);
  });

  it('labels fall incidents for the Timeline', async () => {
    await repo.open(incident({ id: 'inc-fall', openedAt: '2026-07-05T10:00:00.000Z' }));
    const [summary] = await service.listForFamily(familyId);
    expect(summary!.label).toBe('Possible fall');
  });

  it('rejects an unknown family', async () => {
    await expect(
      service.listForFamily('00000000-0000-4000-8000-000000000099'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('surfaces the VLM second opinion for the flag that opened the incident (F3.1)', async () => {
    const flag = '11111111-1111-4111-8111-111111111111';
    await repo.open(
      incident({ id: 'inc-vlm', openedAt: '2026-07-05T10:00:00.000Z', triggeringEventId: flag }),
    );
    await seedSteps('inc-vlm', ['incident_opened']);
    await ingestVerdict(flag, { verdict: 'confirmed', onFloor: true, walkerNearby: false });

    const detail = await service.detailForFamily(familyId, 'inc-vlm');

    expect(detail.secondOpinion).toMatchObject({
      verdict: 'confirmed',
      onFloor: true,
      walkerNearby: false,
      confidence: 0.86,
    });
  });

  it('has a null second opinion when the VLM did not run', async () => {
    await repo.open(
      incident({
        id: 'inc-novlm',
        openedAt: '2026-07-05T10:00:00.000Z',
        triggeringEventId: '33333333-3333-4333-8333-333333333333',
      }),
    );

    const detail = await service.detailForFamily(familyId, 'inc-novlm');

    expect(detail.secondOpinion).toBeNull();
  });

  it('does not read another device’s verdict for the same flag id', async () => {
    const flag = '44444444-4444-4444-8444-444444444444';
    // A verdict from a different device, same aboutEventId — must not leak in.
    await events.ingest({
      eventId: '55555555-5555-4555-8555-555555555555',
      deviceId: '00000000-0000-4000-8000-0000000000d9',
      type: EventType.VlmVerdict,
      occurredAt: '2026-07-05T10:00:05.000Z',
      confidence: 0.9,
      payload: { aboutEventId: flag, verdict: 'confirmed' },
    } as EventEnvelope);
    await repo.open(
      incident({ id: 'inc-x', openedAt: '2026-07-05T10:00:00.000Z', triggeringEventId: flag }),
    );

    const detail = await service.detailForFamily(familyId, 'inc-x');

    expect(detail.secondOpinion).toBeNull();
  });
});
