import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfig } from '../../config/env.validation';
import { DevicesService } from '../devices/devices.service';
import { InMemoryDeviceRepository } from '../devices/in-memory-device.repository';
import type { DeviceStatus } from '../devices/device.entity';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { EventsService } from '../events/events.service';
import { InMemoryEventStreamRepository } from '../events/in-memory-event-stream.repository';
import { InMemoryVisitArrivalRepository } from '../visits/in-memory-visit-arrival.repository';
import { InMemoryVisitsRepository } from '../visits/in-memory-visits.repository';
import { VisitArrivalsService } from '../visits/visit-arrivals.service';
import { DailySummaryService } from './daily-summary.service';
import { IncidentsQueryService } from './incidents-query.service';
import { InMemoryIncidentRepository } from './in-memory-incident.repository';
import { MockNarrationAdapter } from './narration/mock-narration.adapter';
import { InMemoryNarrativeRepository } from './narration/in-memory-narrative.repository';
import type {
  DailySummaryRequest,
  Narration,
  NarrationPort,
  NarrationRequest,
} from './narration/narration.port';
import { NarrationService } from './narration/narration.service';
import type { IncidentStepKind } from './temporal/types';

const DAY = '2026-07-08';

describe('DailySummaryService', () => {
  let incidentRepo: InMemoryIncidentRepository;
  let deviceRepo: InMemoryDeviceRepository;
  let families: FamiliesService;
  let service: DailySummaryService;
  let familyId: string;
  let visitsRepo: InMemoryVisitsRepository;
  let visitArrivals: VisitArrivalsService;

  async function openIncident(
    id: string,
    openedAt: string,
    kinds: IncidentStepKind[],
  ): Promise<void> {
    await incidentRepo.open({
      id,
      familyId,
      deviceId: '00000000-0000-4000-8000-0000000000d0',
      triggeringEventId: null,
      reason: 'fall.suspected',
      openedAt,
    });
    for (let seq = 0; seq < kinds.length; seq++) {
      await incidentRepo.appendStep({
        incidentId: id,
        seq,
        kind: kinds[seq]!,
        contactId: null,
        detail: {},
      });
    }
  }

  async function addDevice(name: string, status: DeviceStatus): Promise<void> {
    await deviceRepo.create({
      id: `dev-${Math.abs(hash(name))}`,
      familyId,
      name,
      status,
      registeredAt: '2026-01-01T00:00:00.000Z',
    });
  }

  beforeEach(async () => {
    incidentRepo = new InMemoryIncidentRepository();
    deviceRepo = new InMemoryDeviceRepository();
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    visitsRepo = new InMemoryVisitsRepository();
    visitArrivals = new VisitArrivalsService(
      visitsRepo,
      new InMemoryVisitArrivalRepository(),
      families,
      { visitArrivalGraceMinutes: 20 } as AppConfig,
    );
    const mock = new MockNarrationAdapter();
    const narration = new NarrationService(mock, new InMemoryNarrativeRepository(), mock);
    const incidents = new IncidentsQueryService(
      incidentRepo,
      families,
      narration,
      new EventsService(new InMemoryEventStreamRepository(), new EventEmitter2()),
    );
    const devices = new DevicesService(deviceRepo, families, new EventEmitter2());
    service = new DailySummaryService(incidents, devices, narration, families, visitArrivals);
    familyId = (await families.create({ name: 'Silva family' })).id;
  });

  it('reassures plainly on a calm day with a watching guardian', async () => {
    await addDevice('Kitchen shelf', 'online');

    const summary = await service.forFamily(familyId, DAY);

    expect(summary.incidentCount).toBe(0);
    expect(summary.guardiansOnline).toBe(1);
    expect(summary.text).toContain('A calm day.');
    expect(summary.text).toContain('watched over the home');
    expect(summary.text).not.toContain('!');
  });

  it('flags an offline guardian even on a calm day', async () => {
    await addDevice('Kitchen shelf', 'offline');
    const summary = await service.forFamily(familyId, DAY);
    expect(summary.guardiansOnline).toBe(0);
    expect(summary.text).toContain('offline');
  });

  it("summarizes the day's incident and its resolution", async () => {
    await addDevice('Kitchen shelf', 'online');
    await openIncident('inc-today', `${DAY}T09:12:00.000Z`, [
      'incident_opened',
      'call_placed',
      'call_answered',
    ]);

    const summary = await service.forFamily(familyId, DAY);

    expect(summary.incidentCount).toBe(1);
    expect(summary.text).toContain('One moment needed attention today.');
    expect(summary.text).toContain('possible fall');
    expect(summary.text).toContain('settled');
  });

  it('buckets by day: yesterday’s incident is not in today’s recap', async () => {
    await openIncident('inc-yesterday', '2026-07-07T22:00:00.000Z', [
      'incident_opened',
      'stood_down',
    ]);

    const summary = await service.forFamily(familyId, DAY);

    expect(summary.incidentCount).toBe(0);
    expect(summary.text).toContain('A calm day.');
  });

  it('recaps expected visits as counts: one arrived, one missed (decision 0011)', async () => {
    await addDevice('Kitchen shelf', 'online');
    const anna = await visitsRepo.create({
      familyId,
      visitorLabel: 'Anna',
      startsAt: `${DAY}T09:00:00.000Z`,
      endsAt: `${DAY}T10:00:00.000Z`,
      notes: null,
    });
    await visitsRepo.create({
      familyId,
      visitorLabel: 'Nurse',
      startsAt: `${DAY}T14:00:00.000Z`,
      endsAt: `${DAY}T15:00:00.000Z`,
      notes: null,
    });
    await visitArrivals.record(
      anna,
      '00000000-0000-4000-8000-00000000e001',
      `${DAY}T09:02:00.000Z`,
    );

    const summary = await service.forFamily(familyId, DAY);

    expect(summary).toMatchObject({ visitsExpected: 2, visitsArrived: 1, visitsMissed: 1 });
    expect(summary.text).toContain('A mostly calm day.');
    expect(summary.text).toContain('One expected visitor arrived.');
    expect(summary.text).toContain('One expected visitor did not arrive.');
    expect(summary.text).not.toContain('Nothing needed your attention.');
    expect(summary.text).not.toContain('Anna');
  });

  it('sends only counts and labels to the narrator, never device names', async () => {
    const spy = new SpyPort();
    const narration = new NarrationService(
      spy,
      new InMemoryNarrativeRepository(),
      new MockNarrationAdapter(),
    );
    const incidents = new IncidentsQueryService(
      incidentRepo,
      families,
      narration,
      new EventsService(new InMemoryEventStreamRepository(), new EventEmitter2()),
    );
    const devices = new DevicesService(deviceRepo, families, new EventEmitter2());
    const svc = new DailySummaryService(incidents, devices, narration, families, visitArrivals);
    await addDevice("Grandma's bedroom camera", 'online');

    await svc.forFamily(familyId, DAY);

    const sent = JSON.stringify(spy.summaryRequests[0]);
    expect(sent).not.toContain('Grandma');
    expect(spy.summaryRequests[0]!.visits).toBeUndefined(); // no visits today, none sent
    expect(sent).not.toContain('bedroom');
    expect(spy.summaryRequests[0]!.guardiansOnline).toBe(1);
  });
});

// A minimal spy port for the privacy assertion.
class SpyPort implements NarrationPort {
  summaryRequests: DailySummaryRequest[] = [];
  async narrate(_request: NarrationRequest): Promise<Narration> {
    return { text: 'x', generatedBy: 'claude', model: 'm' };
  }
  async summarizeDay(request: DailySummaryRequest): Promise<Narration> {
    this.summaryRequests.push(request);
    return { text: 'spy summary', generatedBy: 'claude', model: 'm' };
  }
  async answer(): Promise<Narration> {
    return { text: 'spy answer', generatedBy: 'claude', model: 'm' };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
