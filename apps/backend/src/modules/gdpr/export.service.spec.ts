import type { AuthUser } from '../auth/user.repository';
import type { ActivityService } from '../audit/activity.service';
import type { AppointmentsService } from '../care/appointments.service';
import type { MedicationsService } from '../care/medications.service';
import type { DevicesService } from '../devices/devices.service';
import type { ContactsService } from '../escalation/contacts.service';
import type { IncidentsQueryService } from '../escalation/incidents-query.service';
import type { FamiliesService } from '../families/families.service';
import type { PushTokensService } from '../push/push-tokens.service';
import { ExportService } from './export.service';

const user = { id: 'u1', email: 'ana@example.com', familyId: 'fam-1' } as AuthUser;

describe('ExportService', () => {
  it('assembles a family bundle from every module, expanding incident detail', async () => {
    const families = {
      findByIdOrFail: jest.fn().mockResolvedValue({ id: 'fam-1', name: 'Silva' }),
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

    const service = new ExportService(
      families as unknown as FamiliesService,
      devices as unknown as DevicesService,
      contacts as unknown as ContactsService,
      medications as unknown as MedicationsService,
      appointments as unknown as AppointmentsService,
      incidents as unknown as IncidentsQueryService,
      pushTokens as unknown as PushTokensService,
      activity as unknown as ActivityService,
    );

    const bundle = await service.exportFamily(user);

    expect(bundle.account).toEqual({ userId: 'u1', email: 'ana@example.com' });
    expect(bundle.family).toEqual({ id: 'fam-1', name: 'Silva' });
    expect(bundle.contacts).toHaveLength(1);
    expect(bundle.medications[0]!.name).toBe('Bisoprolol');
    expect(bundle.pushDevices[0]!.token).toBe('tok');
    expect(bundle.activity[0]!.label).toBe('Added a contact');
    // Each incident summary was expanded to full detail.
    expect(incidents.detailForFamily).toHaveBeenCalledTimes(2);
    expect(bundle.incidents.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(() => new Date(bundle.exportedAt).toISOString()).not.toThrow();

    // Everything was scoped to the caller's family.
    expect(families.findByIdOrFail).toHaveBeenCalledWith('fam-1');
    expect(devices.findByFamily).toHaveBeenCalledWith('fam-1');
  });
});
