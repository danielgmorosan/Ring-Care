import type { NextFunction, Request, Response } from 'express';

const MAX_BYTES = 64 * 1024;

/**
 * The app's global body parsers handle JSON and urlencoded bodies. `bee stream` may post
 * its agent-style message as plain text, so for the Bee webhook route we read any other
 * content type as a UTF-8 string into req.body (capped at 64 KiB).
 */
export function rawTextBody(req: Request, res: Response, next: NextFunction): void {
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  if (type.includes('json') || type.includes('urlencoded') || req.readableEnded) {
    next();
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let done = false;
  req.on('data', (chunk: Buffer) => {
    if (done) return;
    size += chunk.length;
    if (size > MAX_BYTES) {
      done = true;
      res.status(413).json({ message: 'Payload too large' });
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (done) return;
    done = true;
    (req as Request & { body: unknown }).body = Buffer.concat(chunks).toString('utf8');
    next();
  });
  req.on('error', (err) => {
    if (done) return;
    done = true;
    next(err);
  });
}
