import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import type { AppConfig } from '../../config/env.validation';
import { AppointmentsService } from '../care/appointments.service';
import { InMemoryAppointmentRepository } from '../care/in-memory-appointment.repository';
import { InMemoryMedicationRepository } from '../care/in-memory-medication.repository';
import { MedicationsService } from '../care/medications.service';
import { EventsService } from '../events/events.service';
import { InMemoryEventStreamRepository } from '../events/in-memory-event-stream.repository';
import { IncidentsQueryService } from '../escalation/incidents-query.service';
import { InMemoryIncidentRepository } from '../escalation/in-memory-incident.repository';
import { MockNarrationAdapter } from '../escalation/narration/mock-narration.adapter';
import { InMemoryNarrativeRepository } from '../escalation/narration/in-memory-narrative.repository';
import type {
  Narration,
  NarrationPort,
  QuestionRequest,
} from '../escalation/narration/narration.port';
import { NarrationService } from '../escalation/narration/narration.service';
import { DevicesService } from '../devices/devices.service';
import { InMemoryDeviceRepository } from '../devices/in-memory-device.repository';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { FleetHealthService } from '../fleet/fleet-health.service';
import { InMemoryHeartbeatRepository } from '../fleet/in-memory-heartbeat.repository';
import { QaService } from './qa.service';

/** Captures the request the narration port is asked to answer. */
class SpyPort implements NarrationPort {
  asked: QuestionRequest[] = [];
  async narrate(): Promise<Narration> {
    return { text: 'x', generatedBy: 'claude', model: 'm' };
  }
  async summarizeDay(): Promise<Narration> {
    return { text: 'x', generatedBy: 'claude', model: 'm' };
  }
  async answer(request: QuestionRequest): Promise<Narration> {
    this.asked.push(request);
    return { text: 'spy answer', generatedBy: 'claude', model: 'm' };
  }
}

const config = { deviceOfflineThresholdSeconds: 90 } as unknown as AppConfig;

describe('QaService', () => {
  let families: FamiliesService;
  let medications: MedicationsService;
  let appointments: AppointmentsService;
  let spy: SpyPort;
  let qa: QaService;
  let familyId: string;

  beforeEach(async () => {
    families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    spy = new SpyPort();
    const mock = new MockNarrationAdapter();
    const narration = new NarrationService(spy, new InMemoryNarrativeRepository(), mock);
    const incidents = new IncidentsQueryService(
      new InMemoryIncidentRepository(),
      families,
      narration,
      new EventsService(new InMemoryEventStreamRepository(), new EventEmitter2()),
    );
    const devices = new DevicesService(
      new InMemoryDeviceRepository(),
      families,
      new EventEmitter2(),
    );
    const fleet = new FleetHealthService(devices, new InMemoryHeartbeatRepository(), config);
    medications = new MedicationsService(new InMemoryMedicationRepository(), families);
    appointments = new AppointmentsService(new InMemoryAppointmentRepository(), families);
    qa = new QaService(families, incidents, fleet, medications, appointments, narration);
    familyId = (await families.create({ name: 'Silva family', timezone: 'Europe/Lisbon' })).id;
  });

  it('assembles the family context and returns an answer', async () => {
    await medications.create(familyId, { name: 'Bisoprolol', times: ['08:00'] });
    await appointments.create(familyId, { title: 'Cardiology', at: '2026-07-20T10:00:00.000Z' });

    const result = await qa.ask(familyId, 'How is everything?');

    expect(result.answer).toBe('spy answer');
    const ctx = spy.asked[0]!.context;
    expect(spy.asked[0]!.question).toBe('How is everything?');
    expect(ctx.timezone).toBe('Europe/Lisbon');
    expect(ctx.medications).toEqual([{ name: 'Bisoprolol', times: ['08:00'] }]);
    expect(ctx.appointments).toEqual([{ title: 'Cardiology', at: '2026-07-20T10:00:00.000Z' }]);
    expect(ctx.guardians).toEqual({ total: 0, online: 0 });
    expect(ctx.incidents).toEqual([]);
  });

  it('sends no contact names or media fields to the port (privacy)', async () => {
    await qa.ask(familyId, 'anything');
    const serialized = JSON.stringify(spy.asked[0]!.context);
    // The context is labels/counts/roles only — no elder identity or media.
    expect(serialized).not.toMatch(/pixels|image|audio|photo|frame|keypoints/i);
    expect(Object.keys(spy.asked[0]!.context).sort()).toEqual([
      'appointments',
      'guardians',
      'incidents',
      'medications',
      'timezone',
    ]);
  });

  it('rejects an unknown family', async () => {
    await expect(qa.ask('00000000-0000-4000-8000-000000000099', 'q')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
