import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics for the backend. Owns its own Registry (not the global default)
 * so the service can be constructed more than once — e.g. in tests — without the
 * "metric already registered" collision prom-client's global registry would cause.
 *
 * Exposes process health (memory, CPU, event-loop lag), HTTP traffic, and two
 * safety-relevant counters: escalations triggered by a detected fall, and canary
 * failures. Scraped at GET /metrics; alerting lives in Prometheus/Grafana.
 */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests: Counter<string>;
  private readonly httpDuration: Histogram<string>;
  private readonly escalationsTriggered: Counter<string>;
  private readonly canaryFailures: Counter<string>;

  constructor() {
    this.registry.setDefaultLabels({ service: 'obrigada-backend' });
    collectDefaultMetrics({ register: this.registry });

    this.httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests handled, by method, route, and status.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds, by method, route, and status.',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
      registers: [this.registry],
    });
    this.escalationsTriggered = new Counter({
      name: 'obrigada_escalations_triggered_total',
      help: 'Escalations started by a detected fall.',
      registers: [this.registry],
    });
    this.canaryFailures = new Counter({
      name: 'obrigada_canary_failures_total',
      help: 'Synthetic canary runs that failed the end-to-end pipeline check.',
      registers: [this.registry],
    });
  }

  /** Record one completed HTTP request. Route is the low-cardinality path pattern. */
  observeHttp(method: string, route: string, status: number, durationSeconds: number): void {
    const labels = { method, route, status: String(status) };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  incEscalationsTriggered(): void {
    this.escalationsTriggered.inc();
  }

  incCanaryFailures(): void {
    this.canaryFailures.inc();
  }

  /** The Prometheus exposition-format content type. */
  get contentType(): string {
    return this.registry.contentType;
  }

  /** The current metrics in Prometheus text exposition format. */
  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
