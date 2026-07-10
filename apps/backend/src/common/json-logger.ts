import type { LoggerService } from '@nestjs/common';
import { getRequestId } from './request-context';

type Level = 'info' | 'error' | 'warn' | 'debug' | 'verbose';

function safeMessage(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  try {
    return typeof message === 'object' ? JSON.stringify(message) : String(message);
  } catch {
    return String(message);
  }
}

/** One structured log line as a JSON string. Pure and exported for testing. */
export function formatLogLine(fields: {
  time: string;
  level: Level;
  message: unknown;
  context?: string;
  requestId?: string;
  stack?: string;
}): string {
  return JSON.stringify({
    time: fields.time,
    level: fields.level,
    context: fields.context,
    requestId: fields.requestId,
    message: safeMessage(fields.message),
    ...(fields.stack ? { stack: fields.stack } : {}),
  });
}

/**
 * A LoggerService that emits one JSON object per line, tagged with the current
 * request's correlation id, for log aggregation (Loki, CloudWatch, …). Errors go to
 * stderr, everything else to stdout. Wired only when LOG_FORMAT=json; dev keeps the
 * pretty Nest logger.
 */
export class JsonLogger implements LoggerService {
  log(message: unknown, ...rest: unknown[]): void {
    this.emit('info', message, rest);
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.emit('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]): void {
    this.emit('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]): void {
    this.emit('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]): void {
    this.emit('verbose', message, rest);
  }

  private emit(level: Level, message: unknown, rest: unknown[]): void {
    // Nest passes the context as the last string arg; error() also passes a stack first.
    const last = rest[rest.length - 1];
    const context = typeof last === 'string' ? last : undefined;
    const stack =
      level === 'error' && rest.length >= 2 && typeof rest[0] === 'string'
        ? (rest[0] as string)
        : undefined;
    const line = formatLogLine({
      time: new Date().toISOString(),
      level,
      message,
      context,
      requestId: getRequestId(),
      stack,
    });
    (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
  }
}
