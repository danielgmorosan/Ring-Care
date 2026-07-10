import { formatLogLine, JsonLogger } from './json-logger';
import { runWithRequestId } from './request-context';

describe('formatLogLine', () => {
  it('produces a JSON line with level, message, context, and request id', () => {
    const parsed = JSON.parse(
      formatLogLine({
        time: '2026-01-01T00:00:00.000Z',
        level: 'info',
        message: 'started',
        context: 'Bootstrap',
        requestId: 'rid-1',
      }),
    );
    expect(parsed).toEqual({
      time: '2026-01-01T00:00:00.000Z',
      level: 'info',
      context: 'Bootstrap',
      requestId: 'rid-1',
      message: 'started',
    });
  });

  it('includes a stack for errors and stringifies non-string messages', () => {
    const parsed = JSON.parse(
      formatLogLine({ time: 't', level: 'error', message: { a: 1 }, stack: 'Error: boom\n  at x' }),
    );
    expect(parsed.message).toBe('{"a":1}');
    expect(parsed.stack).toContain('boom');
  });
});

describe('JsonLogger', () => {
  it('writes one JSON line to stdout with the request id and context', () => {
    const logger = new JsonLogger();
    const writes: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      runWithRequestId('rid-42', () => logger.log('handling request', 'Controller'));
    } finally {
      spy.mockRestore();
    }
    expect(writes[0]!.endsWith('\n')).toBe(true);
    expect(JSON.parse(writes[0]!.trim())).toMatchObject({
      level: 'info',
      message: 'handling request',
      context: 'Controller',
      requestId: 'rid-42',
    });
  });

  it('routes errors to stderr with the stack, and no request id outside a request', () => {
    const logger = new JsonLogger();
    const errs: string[] = [];
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      errs.push(String(chunk));
      return true;
    });
    try {
      logger.error('boom', 'the stack trace', 'Ctx');
    } finally {
      spy.mockRestore();
    }
    const parsed = JSON.parse(errs[0]!.trim());
    expect(parsed).toMatchObject({
      level: 'error',
      message: 'boom',
      context: 'Ctx',
      stack: 'the stack trace',
    });
    expect(parsed.requestId).toBeUndefined();
  });
});
