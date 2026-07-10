import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppConfig } from '../../config/env.validation';
import { InternalEvent, type CanaryFailedPayload } from '../../internal-events/internal-events';
import { EscalationService } from '../escalation/escalation.service';

export interface CanaryRun {
  ok: boolean;
  ranAt: string;
  latencyMs: number;
  outcome?: string;
  error?: string;
}

/** Bound on how long a healthy pipeline run may take before the canary fails it. */
const RUN_TIMEOUT_MS = 30_000;

/**
 * Synthetic canary (F1.6). On an interval it drives a simulated fall through the
 * real escalation pipeline and records whether it completed within budget. A
 * broken pipeline flips /health/canary to down and emits canary.failed, so we hear
 * about a silent guardian system before a family does. Only runs when both the
 * canary and Temporal are configured.
 */
@Injectable()
export class CanaryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CanaryService.name);
  private timer: NodeJS.Timeout | null = null;
  private last: CanaryRun | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly escalation: EscalationService,
    private readonly bus: EventEmitter2,
  ) {}

  onModuleInit(): void {
    if (!this.config.canaryEnabled) {
      this.logger.log('Canary disabled (CANARY_ENABLED not true)');
      return;
    }
    if (!this.config.hasTemporal) {
      this.logger.warn('Canary enabled but Temporal is not configured; canary will not run');
      return;
    }
    const intervalMs = this.config.canaryIntervalSeconds * 1000;
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), intervalMs);
    // Kick an initial run shortly after startup so health is meaningful immediately.
    setTimeout(() => void this.runOnce().catch(() => undefined), 2_000);
    this.logger.log(`Canary armed; interval ${this.config.canaryIntervalSeconds}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getLastRun(): CanaryRun | null {
    return this.last;
  }

  get intervalSeconds(): number {
    return this.config.canaryIntervalSeconds;
  }

  /** Run one probe end-to-end through the escalation pipeline. */
  async runOnce(): Promise<CanaryRun> {
    const startedAt = Date.now();
    const ranAt = new Date(startedAt).toISOString();
    try {
      const { incidentId } = await this.escalation.startEscalation({
        familyId: this.config.canaryFamilyId,
        deviceId: this.config.canaryDeviceId,
        reason: 'canary.synthetic_fall',
        confirmedFall: true,
        initialCheckin: 'silence',
        ackWindowSeconds: 1,
      });

      const result = await this.escalation.awaitOutcome(incidentId, RUN_TIMEOUT_MS);
      const steps = await this.escalation.getIncidentStepKinds(incidentId);
      if (steps.length === 0) {
        throw new Error('pipeline completed but recorded no incident steps');
      }

      const latencyMs = Date.now() - startedAt;
      this.last = { ok: true, ranAt, latencyMs, outcome: result.outcome };
      this.logger.log(`Canary healthy in ${latencyMs}ms (outcome: ${result.outcome})`);
      return this.last;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = (error as Error).message;
      this.last = { ok: false, ranAt, latencyMs, error: message };
      this.logger.error(`Canary FAILED after ${latencyMs}ms: ${message}`);
      const payload: CanaryFailedPayload = { ranAt, latencyMs, error: message };
      this.bus.emit(InternalEvent.CanaryFailed, payload);
      return this.last;
    }
  }
}
