import { createHash, randomBytes } from 'node:crypto';

/**
 * Provisioning claim codes (F2.6). A claim code is a short, single-use, expiring
 * secret the caregiver reads off the family app and types into the phone to bind it
 * to their family. Only the hash is ever stored.
 */

// Crockford-style base32 without I, L, O, U to avoid look-alike confusion when a
// person reads the code off one screen and types it into another.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface ClaimCodeRecord {
  id: string;
  deviceId: string;
  codeHash: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

/** A fresh claim code: the plaintext (shown once) and the hash (stored). */
export function generateClaimCode(): { code: string; codeHash: string } {
  const bytes = randomBytes(8); // 8 symbols x 5 bits = 40 bits of entropy
  let raw = '';
  for (let i = 0; i < 8; i++) {
    // 256 is a multiple of 32, so byte % 32 is unbiased.
    raw += ALPHABET[bytes[i]! % 32];
  }
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return { code, codeHash: hashClaimCode(code) };
}

/** Hash a claim code for storage/lookup. Normalizes case and separators first. */
export function hashClaimCode(code: string): string {
  const normalized = code.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * A long-lived per-device secret issued at provisioning. The guardian keeps the
 * plaintext and presents it on every check-in; the cloud stores only the hash, so a
 * database read cannot impersonate a guardian. The device id is NOT a credential —
 * this token is.
 */
export function generateDeviceToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url'); // 256 bits
  return { token, tokenHash: hashDeviceToken(token) };
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
