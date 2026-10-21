import type { AuthUser } from '../auth/user.repository';
import type { ActivityService } from '../audit/activity.service';
import type { AppointmentsService } from '../care/appointments.service';
import type { MedicationsService } from '../care/medications.service';
import type { DevicesService } from '../devices/devices.service';
import type { ContactsService } from '../escalation/contacts.service';
import type { IncidentsQueryService } from '../escalation/incidents-query.service';
import type { FamiliesService } from '../families/families.service';
import type { PushTokensService } from '../push/push-tokens.service';
import type { CareProposalsService } from '../bee/care-proposals.service';
import type { RingRepository } from '../ring/ring.repository';
import type { VisitArrivalsService } from '../visits/visit-arrivals.service';
import type { VisitsService } from '../visits/visits.service';
import { ExportService } from './export.service';

const user = { id: 'u1', email: 'ana@example.com', familyId: 'fam-1' } as AuthUser;

describe('ExportService', () => {
  it('assembles a family bundle from every module, expanding incident detail', async () => {
    const families = {
      findByIdOrFail: jest.fn().mockResolvedValue({
        id: 'fam-1',
        name: 'Silva',
        elderName: 'Maria',
        elderRelation: 'mother',
      }),
    };
    const devices = { findByFamily: jest.fn().mockResolvedValue([{ id: 'd1' }]) };
    const contacts = { list: jest.fn().mockResolvedValue([{ id: 'c1', role: 'daughter' }]) };
    const medications = { list: jest.fn().mockResolvedValue([{ id: 'm1', name: 'Bisoprolol' }]) };
    const appointments = { list: jest.fn().mockResolvedValue([{ id: 'a1', title: 'Cardiology' }]) };
    const incidents = {
      listForFamily: jest.fn().mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]),
      detailForFamily: jest.fn((_f: string, id: string) => Promise.resolve({ id, steps: [] })),
    };
    const pushTokens = { listForFamily: jest.fn().mockResolvedValue([{ id: 'p1', token: 'tok' }]) };
    const activity = {
      forFamily: jest.fn().mockResolvedValue([{ id: 'act1', label: 'Added a contact' }]),
    };
    const careProposals = {
      list: jest
        .fn()
        .mockResolvedValue([
          { id: 'cp1', status: 'approved', decision: { decision: 'approved', result: {} } },
        ]),
    };
    const visits = { list: jest.fn().mockResolvedValue([{ id: 'v1', visitorLabel: 'Anna' }]) };
    const visitArrivals = {
      listForFamily: jest
        .fn()
        .mockResolvedValue([{ id: 'va1', visitId: 'v1', text: 'Anna arrived at 9:02.' }]),
    };
    const ring = {
      listCameras: jest.fn().mockResolvedValue([{ id: 'rc1', placement: 'front_door' }]),
      listEvents: jest.fn().mockResolvedValue([{ id: 're1', kind: 'motion' }]),
    };

    const service = new ExportService(
      families as unknown as FamiliesService,
      devices as unknown as DevicesService,
      contacts as unknown as ContactsService,
      medications as unknown as MedicationsService,
      appointments as unknown as AppointmentsService,
      incidents as unknown as IncidentsQueryService,
      pushTokens as unknown as PushTokensService,
      activity as unknown as ActivityService,
      careProposals as unknown as CareProposalsService,
      visits as unknown as VisitsService,
      visitArrivals as unknown as VisitArrivalsService,
      ring as unknown as RingRepository,
    );

    const bundle = await service.exportFamily(user);

    expect(bundle.account).toEqual({ userId: 'u1', email: 'ana@example.com' });
    // The elder's display name and relation are the family's data too (Art. 15/20).
    expect(bundle.family).toEqual({
      id: 'fam-1',
      name: 'Silva',
      elderName: 'Maria',
      elderRelation: 'mother',
    });
    expect(bundle.contacts).toHaveLength(1);
    expect(bundle.medications[0]!.name).toBe('Bisoprolol');
    expect(bundle.pushDevices[0]!.token).toBe('tok');
    expect(bundle.activity[0]!.label).toBe('Added a contact');
    // Each incident summary was expanded to full detail.
    expect(incidents.detailForFamily).toHaveBeenCalledTimes(2);
    expect(bundle.incidents.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(() => new Date(bundle.exportedAt).toISOString()).not.toThrow();

    // The hackathon tables: Bee proposals with decisions, visits, arrivals, Ring.
    expect(bundle.careProposals[0]).toMatchObject({
      id: 'cp1',
      decision: { decision: 'approved' },
    });
    expect(bundle.expectedVisits[0]!.visitorLabel).toBe('Anna');
    expect(bundle.visitArrivals[0]!.text).toBe('Anna arrived at 9:02.');
    expect(bundle.ringCameras[0]!.id).toBe('rc1');
    expect(bundle.ringEvents[0]!.id).toBe('re1');

    // Everything was scoped to the caller's family.
    expect(families.findByIdOrFail).toHaveBeenCalledWith('fam-1');
    expect(devices.findByFamily).toHaveBeenCalledWith('fam-1');
    expect(careProposals.list).toHaveBeenCalledWith('fam-1');
    expect(visits.list).toHaveBeenCalledWith('fam-1');
    expect(visitArrivals.listForFamily).toHaveBeenCalledWith('fam-1');
    expect(ring.listCameras).toHaveBeenCalledWith('fam-1');
    expect(ring.listEvents).toHaveBeenCalledWith('fam-1', expect.any(Number));
  });
});
