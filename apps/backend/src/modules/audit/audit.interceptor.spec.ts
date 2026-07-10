import { of, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { REQUEST_USER_KEY } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import type { AccessLogRepository, NewAccessLog } from './access-log.repository';
import { AuditInterceptor } from './audit.interceptor';

const USER: AuthUser = {
  id: 'u1',
  email: 'a@b.co',
  familyId: 'fam-1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Build an http ExecutionContext around a fake request. */
function ctx(req: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const next: CallHandler = { handle: () => of({ ok: true }) };

describe('AuditInterceptor', () => {
  let recorded: NewAccessLog[];
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    recorded = [];
    const log = {
      record: async (e: NewAccessLog) => {
        recorded.push(e);
      },
    } as unknown as AccessLogRepository;
    interceptor = new AuditInterceptor(log);
  });

  it('records an authenticated mutation, reading the user from REQUEST_USER_KEY', async () => {
    const req = {
      method: 'POST',
      [REQUEST_USER_KEY]: USER,
      route: { path: '/me/medications' },
      path: '/me/medications',
    };
    await lastValueFrom(interceptor.intercept(ctx(req), next));

    expect(recorded).toEqual([
      {
        familyId: 'fam-1',
        userId: 'u1',
        action: 'medications.create',
        method: 'POST',
        route: '/me/medications',
      },
    ]);
  });

  it('does not record a read (GET)', async () => {
    const req = { method: 'GET', [REQUEST_USER_KEY]: USER, route: { path: '/me/medications' } };
    await lastValueFrom(interceptor.intercept(ctx(req), next));
    expect(recorded).toHaveLength(0);
  });

  it('does not record an unauthenticated request (no user attached)', async () => {
    const req = { method: 'POST', route: { path: '/provision' }, path: '/provision' };
    await lastValueFrom(interceptor.intercept(ctx(req), next));
    expect(recorded).toHaveLength(0);
  });
});
