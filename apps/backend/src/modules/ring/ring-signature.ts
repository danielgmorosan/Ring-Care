import { createHmac, timingSafeEqual } from 'node:crypto';

/** The header Ring signs webhooks with: `X-Signature: sha256=<hex>`. */
export const RING_SIGNATURE_HEADER = 'x-signature';
/** Set by scripts/ring-sim.ts. The event must still be signed; this only labels it. */
export const RING_SIMULATOR_HEADER = 'x-obrigada-simulator';

/** `sha256=<hex HMAC-SHA256 of the raw body>`, exactly as Ring sends it. */
export function signRingBody(rawBody: Buffer | string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/**
 * Constant-time check of an `X-Signature` header against the raw request bytes. Any
 * malformed, missing or wrong-length header is simply invalid.
 */
export function verifyRingSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(header.trim());
  if (!match) return false;
  const given = Buffer.from(match[1]!.toLowerCase(), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}
