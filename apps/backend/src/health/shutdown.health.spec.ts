import type { HealthIndicatorService } from '@nestjs/terminus';
import type { ReadinessService } from './readiness.service';
import { ShutdownHealthIndicator } from './shutdown.health';

function fakeHealth(): HealthIndicatorService {
  return {
    check: (key: string) => ({
      up: (data?: object) => ({ [key]: { status: 'up', ...data } }),
      down: (data?: object) => ({ [key]: { status: 'down', ...data } }),
    }),
  } as unknown as HealthIndicatorService;
}

function indicator(ready: boolean): ShutdownHealthIndicator {
  const readiness = { isReady: () => ready } as unknown as ReadinessService;
  return new ShutdownHealthIndicator(fakeHealth(), readiness);
}

describe('ShutdownHealthIndicator', () => {
  it('is up while the app is accepting traffic', () => {
    expect(indicator(true).check()).toEqual({ shutdown: { status: 'up' } });
  });

  it('is down while draining for shutdown (so the LB stops routing here)', () => {
    expect(indicator(false).check()).toEqual({ shutdown: { status: 'down', state: 'draining' } });
  });
});
