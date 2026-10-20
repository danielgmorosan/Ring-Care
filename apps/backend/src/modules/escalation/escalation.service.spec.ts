import { NotFoundException } from '@nestjs/common';
import type { Client } from '@temporalio/client';
import type { AppConfig } from '../../config/env.validation';
import type { ContactRepository } from './contact.repository';
import type { IncidentRepository } from './incident.repository';
import type { PushTokensService } from '../push/push-tokens.service';
import type { FamiliesService } from '../families/families.service';
import { EscalationService } from './escalation.service';
import type { EscalationInput } from './temporal/types';

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

describe('EscalationService.startEscalation passes the household timezone (quiet hours)', () => {
  function build(families: Partial<FamiliesService> | undefined) {
    const start = jest.fn().mockResolvedValue(undefined);
    const client = { workflow: { start } } as unknown as Client;
    const incidents = {
      open: jest.fn().mockResolvedValue(undefined),
    } as unknown as IncidentRepository;
    const contacts = {
      listByFamily: jest.fn().mockResolvedValue([]),
    } as unknown as ContactRepository;
    const pushTokens = {
      listForFamily: jest.fn().mockResolvedValue([]),
    } as unknown as PushTokensService;
    const service = new EscalationService(
      { temporalTaskQueue: 'q' } as AppConfig,
      client,
      incidents,
      contacts,
      pushTokens,
      families as FamiliesService | undefined,
    );
    const inputOf = (): EscalationInput =>
      (start.mock.calls[0]![1] as { args: [EscalationInput] }).args[0];
    return { service, inputOf };
  }
  const params = { familyId: 'fam-1', deviceId: 'dev-1', reason: 'fall.suspected' };

  it("looks up the family's timezone", async () => {
    const { service, inputOf } = build({
      findByIdOrFail: jest.fn().mockResolvedValue({ timezone: 'Europe/Lisbon' }),
    });
    await service.startEscalation(params);
    expect(inputOf().timeZone).toBe('Europe/Lisbon');
  });

  it('uses a timezone the caller already has', async () => {
    const findByIdOrFail = jest.fn();
    const { service, inputOf } = build({ findByIdOrFail });
    await service.startEscalation({ ...params, timeZone: 'Asia/Tokyo' });
    expect(inputOf().timeZone).toBe('Asia/Tokyo');
    expect(findByIdOrFail).not.toHaveBeenCalled();
  });

  it('falls back to UTC for an invalid zone or a failed lookup, and still starts', async () => {
    const invalid = build({
      findByIdOrFail: jest.fn().mockResolvedValue({ timezone: 'Nope/Zone' }),
    });
    await invalid.service.startEscalation(params);
    expect(invalid.inputOf().timeZone).toBe('UTC');

    const failing = build({ findByIdOrFail: jest.fn().mockRejectedValue(new Error('gone')) });
    await failing.service.startEscalation(params);
    expect(failing.inputOf().timeZone).toBe('UTC');
  });
});

describe('EscalationService.confirmByCall (press 1)', () => {
  it('signals contactConfirmed on the incident workflow', async () => {
    const signal = jest.fn().mockResolvedValue(undefined);
    const getHandle = jest.fn().mockReturnValue({ signal });
    const client = { workflow: { getHandle } } as unknown as Client;
    const incidents = {
      findById: jest.fn().mockResolvedValue({ id: 'inc-1', familyId: 'fam-1' }),
    } as unknown as IncidentRepository;
    const service = new EscalationService(
      {} as AppConfig,
      client,
      incidents,
      {} as ContactRepository,
      {} as PushTokensService,
    );
    await service.confirmByCall('inc-1', 'miguel');
    expect(getHandle).toHaveBeenCalledWith('incident-inc-1');
    expect(signal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'contactConfirmed' }),
      'miguel',
    );
  });

  it('refuses an unknown incident', async () => {
    const signal = jest.fn();
    const client = { workflow: { getHandle: () => ({ signal }) } } as unknown as Client;
    const incidents = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as IncidentRepository;
    const service = new EscalationService(
      {} as AppConfig,
      client,
      incidents,
      {} as ContactRepository,
      {} as PushTokensService,
    );
    await expect(service.confirmByCall('missing', 'miguel')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(signal).not.toHaveBeenCalled();
  });
});
