/**
 * One family-facing alert the system delivered (F2). A single append-only record for
 * everything the family is told about — a stranger, a hazard-zone entry, a doorway
 * crossing at an unusual hour, or someone who left and did not return. It is the "what
 * have we been alerted about" trail behind GET /me/alerts, and the audit that every
 * alert was raised (rule #7). Labels and text only, never media (rule #1).
 */
export interface Alert {
  id: string;
  familyId: string;
  /** The guardian that raised it, or null for a family-level alert (e.g. a missed dose). */
  deviceId: string | null;
  kind: AlertKind;
  /** The exact words sent to the family, in brand voice. */
  message: string;
  /** The source id (a triggering event id, or a wander-watch id) — the idempotency key. */
  ref: string;
  /** When the alerting condition happened (device time for events; due time for wander). */
  at: string;
  createdAt: string;
}

/**
 * What was alerted. A bounded set the family app can group and icon by; it maps 1:1 to
 * the coverage rules that raise alerts.
 */
export const ALERT_KINDS = [
  'stranger',
  'hazard_zone',
  'door_unusual_hour',
  'wander',
  'missed_dose',
  // Ring care logic (decision 0011). Named after the contract's reasons.
  'door.night_activity',
  'visit.no_show',
] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];
