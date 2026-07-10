import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Records every HTTP request's count and duration. Uses the matched route pattern
 * (e.g. /me/incidents/:id) as the label, never the concrete URL, so ids do not blow
 * up metric cardinality. Records on both success and error — it never alters the
 * response, only observes it.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    const record = (status: number): void => {
      const route = req.route?.path ?? 'unknown';
      this.metrics.observeHttp(req.method, route, status, (Date.now() - start) / 1000);
    };

    return next.handle().pipe(
      tap(() => record(res.statusCode)),
      catchError((err: unknown) => {
        const status =
          err && typeof (err as { status?: unknown }).status === 'number'
            ? (err as { status: number }).status
            : 500;
        record(status);
        throw err;
      }),
    );
  }
}
