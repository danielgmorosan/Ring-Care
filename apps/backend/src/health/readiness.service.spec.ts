import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  it('is ready until draining begins', () => {
    const svc = new ReadinessService();
    expect(svc.isReady()).toBe(true);
  });

  it('reports not-ready once draining begins (gates /health/ready to 503)', () => {
    const svc = new ReadinessService();
    svc.beginDraining();
    expect(svc.isReady()).toBe(false);
  });

  it('is idempotent — draining twice stays drained', () => {
    const svc = new ReadinessService();
    svc.beginDraining();
    svc.beginDraining();
    expect(svc.isReady()).toBe(false);
  });
});
