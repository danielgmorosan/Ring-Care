import type { ClaimCodeRecord } from './provisioning';

export interface NewClaimCode {
  deviceId: string;
  codeHash: string;
  expiresAt: string;
}

/**
 * Store for device provisioning claim codes. The service depends on this, not on a
 * database. Codes are looked up by hash at redemption time.
 */
export interface ClaimCodeRepository {
  create(input: NewClaimCode): Promise<ClaimCodeRecord>;
  findByCodeHash(codeHash: string): Promise<ClaimCodeRecord | null>;
  /** Mark a code redeemed (single-use). */
  consume(id: string, consumedAt: string): Promise<void>;
}

export const CLAIM_CODE_REPOSITORY = Symbol('CLAIM_CODE_REPOSITORY');
