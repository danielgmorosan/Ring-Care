import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppConfig } from '../../config/env.validation';
import { InternalEvent } from '../../internal-events/internal-events';
import type { EscalationService } from '../escalation/escalation.service';
import { CanaryService } from './canary.service';

const config = {
  canaryFamilyId: 'fam-canary',
  canaryDeviceId: 'dev-canary',
  canaryIntervalSeconds: 3600,
  canaryEnabled: true,
  hasTemporal: true,
} as unknown as AppConfig;

function makeEscalation(over: Partial<EscalationService>): EscalationService {
  return {
    startEscalation: jest.fn().mockResolvedValue({ incidentId: 'inc-1' }),
    awaitOutcome: jest.fn().mockResolvedValue({
      outcome: 'emergency_notified',
      acknowledgedByContactId: null,
      steps: 5,
    }),
    getIncidentStepKinds: jest.fn().mockResolvedValue(['incident_opened', 'emergency_notified']),
    ...over,
  } as unknown as EscalationService;
}

describe('CanaryService.runOnce', () => {
  it('reports healthy when the pipeline completes with recorded steps', async () => {
    const bus = new EventEmitter2();
    const canary = new CanaryService(config, makeEscalation({}), bus);

    const run = await canary.runOnce();

    expect(run.ok).toBe(true);
    expect(run.outcome).toBe('emergency_notified');
    expect(run.latencyMs).toEqual(expect.any(Number));
    expect(canary.getLastRun()).toBe(run);
  });

  it('fails and emits canary.failed when the pipeline errors', async () => {
    const bus = new EventEmitter2();
    const failed = jest.fn();
    bus.on(InternalEvent.CanaryFailed, failed);
    const canary = new CanaryService(
      config,
      makeEscalation({ awaitOutcome: jest.fn().mockRejectedValue(new Error('timed out')) }),
      bus,
    );

    const run = await canary.runOnce();

    expect(run.ok).toBe(false);
    expect(run.error).toBe('timed out');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('fails when the pipeline records no steps (silent break)', async () => {
    const bus = new EventEmitter2();
    const canary = new CanaryService(
      config,
      makeEscalation({ getIncidentStepKinds: jest.fn().mockResolvedValue([]) }),
      bus,
    );

    const run = await canary.runOnce();

    expect(run.ok).toBe(false);
    expect(run.error).toMatch(/no incident steps/i);
  });
});
