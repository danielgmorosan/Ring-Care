import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRequestId } from './request-context';

/** Standard reason phrases for the statuses this API returns. */
const REASON: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/** The uniform error body every failed request returns. */
export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId: string | undefined;
  timestamp: string;
  path: string;
}

/**
 * Turns every error into one consistent JSON shape carrying the request's
 * correlation id — so a caregiver hitting an error, or the family app logging one,
 * has an id that ties straight to the server logs. The `message` field is preserved
 * exactly (string or the validation-error array) so existing clients keep working.
 * Unexpected (non-HTTP) errors are logged with their id and returned as a generic
 * 500 — internal details never leak to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = getRequestId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = REASON[500]!;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = REASON[status] ?? 'Error';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { message?: string | string[]; error?: string };
        if (b.message !== undefined) message = b.message;
        if (b.error !== undefined) error = b.error;
      }
    } else {
      // Unknown/unexpected: log it (with the correlation id) but never leak internals.
      const detail = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`Unhandled ${req.method} ${req.url} [${requestId ?? 'no-id'}]: ${detail}`);
    }

    const envelope: ErrorEnvelope = {
      statusCode: status,
      error,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
    res.status(status).json(envelope);
  }
}
