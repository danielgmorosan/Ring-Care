import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { ReadinessService } from './readiness.service';

/**
 * Readiness indicator that reports down while the app is draining for shutdown, so a
 * load balancer stops routing traffic here before connections close. Liveness is
 * unaffected — the process is still alive, just no longer accepting new work.
 */
@Injectable()
export class ShutdownHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    private readonly readiness: ReadinessService,
  ) {}

  check(key = 'shutdown'): HealthIndicatorResult {
    const indicator = this.health.check(key);
    return this.readiness.isReady() ? indicator.up() : indicator.down({ state: 'draining' });
  }
}
