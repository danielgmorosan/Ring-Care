import { NotFoundException } from '@nestjs/common';
import type { Client } from '@temporalio/client';
import type { AppConfig } from '../../config/env.validation';
import type { ContactRepository } from './contact.repository';
import type { IncidentRepository } from './incident.repository';
import type { PushTokensService } from '../push/push-tokens.service';
import { EscalationService } from './escalation.service';

function build(incidentFamilyId: string | null) {
  const signal = jest.fn().mockResolvedValue(undefined);
  const client = {
    workflow: { getHandle: () => ({ signal }) },
  } as unknown as Client;
  const incidents = {
    findById: jest.fn().mockResolvedValue(
      incidentFamilyId === null
        ? null
        : {
            id: 'inc-1',
            familyId: incidentFamilyId,
            deviceId: 'd',
            reason: 'r',
            openedAt: 'now',
          },
    ),
  } as unknown as IncidentRepository;
  const service = new EscalationService(
    {} as AppConfig,
    client,
    incidents,
    {} as ContactRepository,
    {} as PushTokensService,
  );
  return { service, signal };
}

describe('EscalationService ownership', () => {
  it('delivers a check-in to an incident the family owns', async () => {
    const { service, signal } = build('fam-1');
    await service.deliverCheckin('inc-1', 'i_am_fine', 'fam-1');
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it('rejects a check-in for another family’s incident, never signalling it', async () => {
    const { service, signal } = build('fam-OTHER');
    await expect(service.deliverCheckin('inc-1', 'i_am_fine', 'fam-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(signal).not.toHaveBeenCalled();
  });

  it('rejects a check-in for a non-existent incident', async () => {
    const { service, signal } = build(null);
    await expect(service.deliverCheckin('missing', 'silence', 'fam-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(signal).not.toHaveBeenCalled();
  });

  it('rejects an acknowledgement for another family’s incident', async () => {
    const { service, signal } = build('fam-OTHER');
    await expect(service.acknowledge('inc-1', 'contact-1', 'fam-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(signal).not.toHaveBeenCalled();
  });

  it('signals a caregiver acknowledge for an owned incident (0008)', async () => {
    const { service, signal } = build('fam-1');
    await service.caregiverAcknowledge('inc-1', 'fam-1', 'user-1');
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it('rejects a caregiver acknowledge for another family’s incident', async () => {
    const { service, signal } = build('fam-OTHER');
    await expect(service.caregiverAcknowledge('inc-1', 'fam-1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(signal).not.toHaveBeenCalled();
  });

  it('signals a resolve for an owned incident, and rejects a foreign one', async () => {
    const owned = build('fam-1');
    await owned.service.resolve('inc-1', 'fam-1');
    expect(owned.signal).toHaveBeenCalledTimes(1);

    const foreign = build('fam-OTHER');
    await expect(foreign.service.resolve('inc-1', 'fam-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(foreign.signal).not.toHaveBeenCalled();
  });
});

describe('EscalationService.recordDeviceCheckin (F1.3)', () => {
  function build(activeIncidentId: string | null) {
    const signal = jest.fn().mockResolvedValue(undefined);
    const client = {
      workflow: { getHandle: () => ({ signal }) },
    } as unknown as Client;
    const findActiveForDevice = jest.fn().mockResolvedValue(
      activeIncidentId === null
        ? null
        : {
            id: activeIncidentId,
            familyId: 'fam-1',
            deviceId: 'dev-1',
            reason: 'fall.suspected',
            openedAt: 'now',
          },
    );
    const incidents = { findActiveForDevice } as unknown as IncidentRepository;
    const service = new EscalationService(
      {} as AppConfig,
      client,
      incidents,
      {} as ContactRepository,
      {} as PushTokensService,
    );
    return { service, signal, findActiveForDevice };
  }

  it('signals the device’s open incident with the elder’s answer', async () => {
    const { service, signal, findActiveForDevice } = build('inc-1');
    await service.recordDeviceCheckin('dev-1', 'i_am_fine');
    expect(findActiveForDevice).toHaveBeenCalledWith('dev-1');
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the device has no active incident (no signal)', async () => {
    const { service, signal } = build(null);
    await service.recordDeviceCheckin('dev-1', 'silence');
    expect(signal).not.toHaveBeenCalled();
  });

  it('is a no-op when the escalation engine is not configured', async () => {
    const findActiveForDevice = jest.fn();
    const incidents = { findActiveForDevice } as unknown as IncidentRepository;
    const service = new EscalationService(
      {} as AppConfig,
      null, // no Temporal client
      incidents,
      {} as ContactRepository,
      {} as PushTokensService,
    );
    await service.recordDeviceCheckin('dev-1', 'distress');
    expect(findActiveForDevice).not.toHaveBeenCalled();
  });
});
