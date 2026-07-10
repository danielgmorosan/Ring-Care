import type { AppConfig } from '../../config/env.validation';
import type { FallDetectedPayload } from '../../internal-events/internal-events';
import type { Device } from '../devices/device.entity';
import type { DevicesService } from '../devices/devices.service';
import type { EventsService, SecondOpinion } from '../events/events.service';
import { EscalationTriggerService } from './escalation-trigger.service';
import type { EscalationService } from './escalation.service';
import type { IncidentRepository } from './incident.repository';

const confirmed: FallDetectedPayload = {
  deviceId: 'dev-1',
  eventId: 'evt-1',
  type: 'fall.confirmed',
  occurredAt: '2026-07-06T18:00:00.000Z',
};
const suspected: FallDetectedPayload = { ...confirmed, eventId: 'evt-2', type: 'fall.suspected' };

const device = { id: 'dev-1', familyId: 'fam-1' } as Device;

function make(
  config: Partial<AppConfig>,
  deviceResult: Device | null,
  hasActive = false,
  secondOpinions: Array<Partial<SecondOpinion>> = [],
): {
  service: EscalationTriggerService;
  startEscalation: jest.Mock;
  hasActiveForDevice: jest.Mock;
  recordDeviceCheckin: jest.Mock;
} {
  const startEscalation = jest.fn().mockResolvedValue({ incidentId: 'inc-1' });
  const recordDeviceCheckin = jest.fn().mockResolvedValue(undefined);
  const devices = {
    findById: jest.fn().mockResolvedValue(deviceResult),
  } as unknown as DevicesService;
  const escalation = { startEscalation, recordDeviceCheckin } as unknown as EscalationService;
  const events = {
    secondOpinionsFor: jest.fn().mockResolvedValue(secondOpinions),
  } as unknown as EventsService;
  const hasActiveForDevice = jest.fn().mockResolvedValue(hasActive);
  const incidents = { hasActiveForDevice } as unknown as IncidentRepository;
  const service = new EscalationTriggerService(
    config as AppConfig,
    devices,
    escalation,
    events,
    incidents,
  );
  return { service, startEscalation, hasActiveForDevice, recordDeviceCheckin };
}

describe('EscalationTriggerService', () => {
  it('starts the ladder with confirmedFall=true on a confirmed fall', async () => {
    const { service, startEscalation } = make({ hasTemporal: true }, device);

    await service.onFallDetected(confirmed);

    expect(startEscalation).toHaveBeenCalledWith({
      familyId: 'fam-1',
      deviceId: 'dev-1',
      reason: 'fall.confirmed',
      triggeringEventId: 'evt-1',
      confirmedFall: true,
    });
  });

  it('starts the ladder with confirmedFall=false on a suspected fall', async () => {
    const { service, startEscalation } = make({ hasTemporal: true }, device);

    await service.onFallDetected(suspected);

    expect(startEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'fall.suspected', confirmedFall: false }),
    );
  });

  it('upgrades a suspected fall to confirmed urgency when the VLM confirmed it (F3.1)', async () => {
    const { service, startEscalation } = make({ hasTemporal: true }, device, false, [
      { verdict: 'confirmed', onFloor: true },
    ]);

    await service.onFallDetected(suspected);

    expect(startEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'fall.suspected', confirmedFall: true }),
    );
  });

  it('does not upgrade when the VLM refuted or was unsure (never suppresses either)', async () => {
    const { service, startEscalation } = make({ hasTemporal: true }, device, false, [
      { verdict: 'refuted' },
    ]);

    await service.onFallDetected(suspected);

    expect(startEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'fall.suspected', confirmedFall: false }),
    );
  });

  it('de-duplicates: skips when the device already has an active incident', async () => {
    const { service, startEscalation, hasActiveForDevice } = make(
      { hasTemporal: true },
      device,
      true,
    );

    await service.onFallDetected(confirmed); // e.g. confirmed arrives after a suspected one

    expect(hasActiveForDevice).toHaveBeenCalledWith('dev-1');
    expect(startEscalation).not.toHaveBeenCalled();
  });

  it('does not start the ladder when the escalation engine is not configured', async () => {
    const { service, startEscalation } = make({ hasTemporal: false }, device);
    await service.onFallDetected(confirmed);
    expect(startEscalation).not.toHaveBeenCalled();
  });

  it('does nothing (and does not throw) for a fall from an unknown device', async () => {
    const { service, startEscalation } = make({ hasTemporal: true }, null);
    await expect(service.onFallDetected(confirmed)).resolves.toBeUndefined();
    expect(startEscalation).not.toHaveBeenCalled();
  });

  it('swallows an escalation failure rather than throwing back into ingestion', async () => {
    const { service, startEscalation } = make({ hasTemporal: true }, device);
    startEscalation.mockRejectedValue(new Error('temporal down'));
    await expect(service.onFallDetected(confirmed)).resolves.toBeUndefined();
  });

  it('routes an on-device voice check-in result to the escalation service (F1.3)', async () => {
    const { service, recordDeviceCheckin } = make({ hasTemporal: true }, device);

    await service.onVoiceCheckinReported({
      deviceId: 'dev-1',
      eventId: 'evt-3',
      occurredAt: '2026-07-06T18:00:05.000Z',
      result: 'i_am_fine',
    });

    expect(recordDeviceCheckin).toHaveBeenCalledWith('dev-1', 'i_am_fine');
  });

  it('ignores a check-in when the escalation engine is not configured', async () => {
    const { service, recordDeviceCheckin } = make({ hasTemporal: false }, device);

    await service.onVoiceCheckinReported({
      deviceId: 'dev-1',
      eventId: 'evt-3',
      occurredAt: '2026-07-06T18:00:05.000Z',
      result: 'distress',
    });

    expect(recordDeviceCheckin).not.toHaveBeenCalled();
  });

  it('swallows a check-in delivery failure rather than throwing back into ingestion', async () => {
    const { service, recordDeviceCheckin } = make({ hasTemporal: true }, device);
    recordDeviceCheckin.mockRejectedValue(new Error('temporal down'));
    await expect(
      service.onVoiceCheckinReported({
        deviceId: 'dev-1',
        eventId: 'evt-3',
        occurredAt: '2026-07-06T18:00:05.000Z',
        result: 'silence',
      }),
    ).resolves.toBeUndefined();
  });
});
