import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Signed webhooks whose bytes we must keep exactly as sent, whatever the content type.
 * Ring signs the raw body (HMAC) and may send `application/vnd.api+json`; `bee stream`
 * may post `text/plain`. Nest's built-in parsers only keep raw bytes for
 * `application/json`, so these paths read the body themselves.
 */
export const RAW_WEBHOOK_ROUTES: ReadonlyArray<{ path: string; limitBytes: number }> = [
  { path: '/ring/webhook', limitBytes: 100 * 1024 },
  { path: '/bee/webhook', limitBytes: 64 * 1024 },
];

/**
 * Reads a POST body of any content type into a Buffer, kept as both `req.rawBody` (for
 * signature checks) and `req.body` (the controller decodes it). Once the stream is
 * consumed, the global JSON/urlencoded parsers see a finished request and skip it.
 */
export function rawWebhookBody(limitBytes: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'POST' || req.readableEnded) {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limitBytes) {
        done = true;
        res.status(413).json({ statusCode: 413, message: 'Payload too large' });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      const raw = Buffer.concat(chunks);
      const r = req as Request & { rawBody?: Buffer; body: unknown };
      r.rawBody = raw;
      r.body = raw;
      next();
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      next(err);
    });
  };
}

/**
 * Mounts the raw readers for the webhook paths. Call before the app initializes (before
 * `listen` or `init`): Nest registers its global body parsers at init, after these, so
 * every other route keeps its normal JSON parsing.
 */
export function installRawWebhookBodies(app: INestApplication): void {
  for (const { path, limitBytes } of RAW_WEBHOOK_ROUTES) app.use(path, rawWebhookBody(limitBytes));
}
