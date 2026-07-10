import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { CanaryService } from './canary.service';

/**
 * Health indicator backing /health/canary. Down when the last run failed or has
 * gone stale (older than twice the interval — i.e. a run was missed). This is the
 * signal external alerting (Grafana/Prometheus) watches.
 */
@Injectable()
export class CanaryHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    private readonly canary: CanaryService,
  ) {}

  check(key = 'canary'): HealthIndicatorResult {
    const indicator = this.health.check(key);
    const last = this.canary.getLastRun();

    if (!last) {
      return indicator.up({ state: 'no_run_yet' });
    }
    if (!last.ok) {
      return indicator.down({ error: last.error, ranAt: last.ranAt });
    }
    const ageMs = Date.now() - Date.parse(last.ranAt);
    if (ageMs > this.canary.intervalSeconds * 1000 * 2) {
      return indicator.down({ state: 'stale', ranAt: last.ranAt });
    }
    return indicator.up({ latencyMs: last.latencyMs, outcome: last.outcome, ranAt: last.ranAt });
  }
}
