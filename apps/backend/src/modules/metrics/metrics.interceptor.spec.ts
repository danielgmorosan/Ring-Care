import { firstValueFrom, of, throwError } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { MetricsInterceptor } from './metrics.interceptor';
import type { MetricsService } from './metrics.service';

function context(method: string, routePath: string | undefined, statusCode: number) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method, route: routePath ? { path: routePath } : undefined }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsInterceptor', () => {
  let observeHttp: jest.Mock;
  let interceptor: MetricsInterceptor;

  beforeEach(() => {
    observeHttp = jest.fn();
    interceptor = new MetricsInterceptor({ observeHttp } as unknown as MetricsService);
  });

  it('records method, route pattern, status, and duration on success', async () => {
    const next = { handle: () => of('ok') } as CallHandler;

    await firstValueFrom(interceptor.intercept(context('GET', '/me/incidents/:id', 200), next));

    expect(observeHttp).toHaveBeenCalledTimes(1);
    const [method, route, status, duration] = observeHttp.mock.calls[0]!;
    expect([method, route, status]).toEqual(['GET', '/me/incidents/:id', 200]);
    expect(typeof duration).toBe('number');
  });

  it('records the error status when the handler throws', async () => {
    const next = {
      handle: () => throwError(() => ({ status: 403 })),
    } as CallHandler;

    await expect(
      firstValueFrom(interceptor.intercept(context('POST', '/me/erase', 200), next)),
    ).rejects.toBeDefined();

    expect(observeHttp).toHaveBeenCalledWith('POST', '/me/erase', 403, expect.any(Number));
  });

  it('labels an unmatched route as "unknown"', async () => {
    const next = { handle: () => of('ok') } as CallHandler;

    await firstValueFrom(interceptor.intercept(context('GET', undefined, 404), next));

    expect(observeHttp).toHaveBeenCalledWith('GET', 'unknown', 404, expect.any(Number));
  });
});
