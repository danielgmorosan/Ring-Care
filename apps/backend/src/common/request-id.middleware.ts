import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestId } from './request-context';

const HEADER = 'x-request-id';

/**
 * Gives every request a correlation id. It echoes an incoming `X-Request-Id` — so a
 * trace can span the family app -> API (or several hops) — or generates one. The id
 * is set on the response and held in async-local storage for the request's lifetime,
 * so logs, metrics, and error responses can all reference the same id. Runs first,
 * before guards and interceptors, so the whole request is in context.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[HEADER];
  const provided = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = provided?.trim() || randomUUID();
  res.setHeader('X-Request-Id', requestId);
  runWithRequestId(requestId, () => next());
}
