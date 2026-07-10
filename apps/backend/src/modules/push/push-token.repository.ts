import { PushToken } from './push-token.entity';

/** Fields needed to register (upsert) a device token. */
export interface UpsertPushToken {
  userId: string;
  familyId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
}

/**
 * Repository port for device push tokens. The service depends on this, not a
 * database; in-memory and Postgres adapters satisfy it.
 */
export interface PushTokenRepository {
  /** Register a token, or re-point an existing one (unique on token). */
  upsert(input: UpsertPushToken): Promise<PushToken>;
  /** All device tokens registered for a family (escalation alerts them). */
  listByFamily(familyId: string): Promise<PushToken[]>;
  /** Remove a token for a family (sign-out / device change). */
  deleteByToken(familyId: string, token: string): Promise<void>;
}

export const PUSH_TOKEN_REPOSITORY = Symbol('PUSH_TOKEN_REPOSITORY');
