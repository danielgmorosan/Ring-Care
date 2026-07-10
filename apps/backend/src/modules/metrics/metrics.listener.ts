import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InternalEvent } from '../../internal-events/internal-events';
import { MetricsService } from './metrics.service';

/**
 * Turns internal domain events into metrics without coupling the metrics module to
 * escalation or the canary — it just listens on the in-process bus.
 */
@Injectable()
export class MetricsListener {
  constructor(private readonly metrics: MetricsService) {}

  @OnEvent(InternalEvent.FallDetected)
  onFallDetected(): void {
    this.metrics.incEscalationsTriggered();
  }

  @OnEvent(InternalEvent.CanaryFailed)
  onCanaryFailed(): void {
    this.metrics.incCanaryFailures();
  }
}
