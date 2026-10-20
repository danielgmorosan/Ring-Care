import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../auth/user.repository';
import type { UserRepository } from '../auth/user.repository';
import type { AppointmentsService } from '../care/appointments.service';
import type { MedicationsService } from '../care/medications.service';
import type { DevicesService } from '../devices/devices.service';
import type { ContactsService } from '../escalation/contacts.service';
import type { FamiliesService } from '../families/families.service';
import type { PushTokensService } from '../push/push-tokens.service';
import type { RingRepository } from '../ring/ring.repository';
import type { VisitsService } from '../visits/visits.service';
import { ErasureService } from './erasure.service';

const user = { id: 'u1', email: 'ana@example.com', familyId: 'fam-1' } as AuthUser;

function build() {
  const families = {
    findByIdOrFail: jest.fn().mockResolvedValue({ id: 'fam-1', name: 'Silva family' }),
    update: jest.fn().mockResolvedValue({}),
  };
  const contacts = { redactForFamily: jest.fn().mockResolvedValue(undefined) };
  const medications = {
    list: jest.fn().mockResolvedValue([{ id: 'm1' }]),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const appointments = {
    list: jest.fn().mockResolvedValue([{ id: 'a1' }]),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const pushTokens = {
    listForFamily: jest.fn().mockResolvedValue([{ token: 'tok' }]),
    unregister: jest.fn().mockResolvedValue(undefined),
  };
  const devices = { redactNamesForFamily: jest.fn().mockResolvedValue(undefined) };
  const users = { redactByFamily: jest.fn().mockResolvedValue(undefined) };
  const visits = {
    list: jest.fn().mockResolvedValue([{ id: 'v1' }]),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const ring = { redactCameraNamesForFamily: jest.fn().mockResolvedValue(undefined) };

  const service = new ErasureService(
    families as unknown as FamiliesService,
    contacts as unknown as ContactsService,
    medications as unknown as MedicationsService,
    appointments as unknown as AppointmentsService,
    pushTokens as unknown as PushTokensService,
    devices as unknown as DevicesService,
    users as unknown as UserRepository,
    visits as unknown as VisitsService,
    ring as unknown as RingRepository,
  );
  return {
    service,
    families,
    contacts,
    medications,
    appointments,
    pushTokens,
    devices,
    users,
    visits,
    ring,
  };
}

describe('ErasureService', () => {
  it('erases every identifying record when the family name is confirmed', async () => {
    const t = build();

    const result = await t.service.erase(user, 'Silva family');

    expect(result).toEqual({ erased: true });
    expect(t.contacts.redactForFamily).toHaveBeenCalledWith('fam-1');
    expect(t.devices.redactNamesForFamily).toHaveBeenCalledWith('fam-1');
    expect(t.medications.delete).toHaveBeenCalledWith('fam-1', 'm1');
    expect(t.appointments.delete).toHaveBeenCalledWith('fam-1', 'a1');
    expect(t.pushTokens.unregister).toHaveBeenCalledWith('fam-1', 'tok');
    expect(t.users.redactByFamily).toHaveBeenCalledWith('fam-1');
    expect(t.families.update).toHaveBeenCalledWith('fam-1', { name: 'Erased household' });
    // Hackathon tables: editable rows erased; append-only rows are never touched.
    expect(t.visits.delete).toHaveBeenCalledWith('fam-1', 'v1');
    expect(t.ring.redactCameraNamesForFamily).toHaveBeenCalledWith('fam-1');
  });

  it('refuses and touches nothing when the confirmation name does not match', async () => {
    const t = build();

    await expect(t.service.erase(user, 'Wrong name')).rejects.toBeInstanceOf(BadRequestException);

    expect(t.contacts.redactForFamily).not.toHaveBeenCalled();
    expect(t.users.redactByFamily).not.toHaveBeenCalled();
    expect(t.families.update).not.toHaveBeenCalled();
    expect(t.visits.delete).not.toHaveBeenCalled();
    expect(t.ring.redactCameraNamesForFamily).not.toHaveBeenCalled();
  });
});
