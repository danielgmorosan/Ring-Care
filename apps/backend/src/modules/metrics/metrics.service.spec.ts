import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('exposes process, HTTP, and safety counters in Prometheus format', async () => {
    const metrics = new MetricsService();

    metrics.observeHttp('GET', '/me/incidents/:id', 200, 0.042);
    metrics.incEscalationsTriggered();
    metrics.incCanaryFailures();
    metrics.incCanaryFailures();

    const output = await metrics.metrics();

    // Default process metrics are collected.
    expect(output).toContain('process_cpu_user_seconds_total');
    // HTTP request counted with its route pattern and status.
    expect(output).toMatch(/http_requests_total\{[^}]*route="\/me\/incidents\/:id"[^}]*\} 1/);
    // Safety counters carry the observed values (with the default service label).
    expect(output).toMatch(/obrigada_escalations_triggered_total\{[^}]*\} 1/);
    expect(output).toMatch(/obrigada_canary_failures_total\{[^}]*\} 2/);
  });

  it('can be constructed twice without a registry collision (own registry)', () => {
    expect(() => {
      new MetricsService();
      new MetricsService();
    }).not.toThrow();
  });
});
