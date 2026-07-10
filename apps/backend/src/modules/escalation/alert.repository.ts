import type { Alert, AlertKind } from './alert.entity';

/** An alert to record. `id`/`createdAt` are assigned by the store. */
export interface NewAlert {
  familyId: string;
  /** The guardian that raised it, or null for a family-level alert (e.g. a missed dose). */
  deviceId: string | null;
  kind: AlertKind;
  message: string;
  ref: string;
  at: string;
}

/**
 * Append-only store of delivered alerts (F2). The only write is append(); no update or
 * delete (rule #2), enforced at the database level. Idempotent on (ref, kind) so a
 * re-raise records once.
 */
export interface AlertRepository {
  append(alert: NewAlert): Promise<void>;
  /** A family's alerts, newest first (the read side for the family surface). */
  listByFamily(familyId: string): Promise<Alert[]>;
  /** Whether an alert with this (ref, kind) was already recorded — for once-only raises. */
  existsByRefKind(ref: string, kind: AlertKind): Promise<boolean>;
}

export const ALERT_REPOSITORY = Symbol('ALERT_REPOSITORY');
