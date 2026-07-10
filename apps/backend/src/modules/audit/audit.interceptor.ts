import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, concatMap } from 'rxjs';
import type { Request } from 'express';
import { REQUEST_USER_KEY } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { ACCESS_LOG_REPOSITORY, type AccessLogRepository } from './access-log.repository';
import { deriveAction } from './audit-action';

const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Records every successful, authenticated mutation of family data to the append-only
 * access log (rule #7). Reads are not logged here (they would drown the caregiver's
 * activity history); admin-tooling reads get their own logging when that lands.
 *
 * The record is awaited before the response returns, so the audit trail (and the
 * activity feed) is immediately consistent with the change just made. A failed write
 * is logged but never fails the request — the mutation already committed, so returning
 * an error would be misleading.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(@Inject(ACCESS_LOG_REPOSITORY) private readonly log: AccessLogRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    // The JwtAuthGuard attaches the user under REQUEST_USER_KEY, not `req.user`.
    const req = context.switchToHttp().getRequest<Request & { [REQUEST_USER_KEY]?: AuthUser }>();
    const user = req[REQUEST_USER_KEY];
    const method = req.method;

    // Only successful, authenticated mutations of a family's own data.
    const shouldAudit = Boolean(user) && MUTATIONS.has(method);

    return next.handle().pipe(
      concatMap(async (result) => {
        if (shouldAudit && user) {
          const route = req.route?.path ?? req.path;
          await this.log
            .record({
              familyId: user.familyId,
              userId: user.id,
              action: deriveAction(method, route),
              method,
              route,
            })
            .catch((err) =>
              this.logger.warn(`Failed to write access log: ${(err as Error).message}`),
            );
        }
        return result;
      }),
    );
  }
}
