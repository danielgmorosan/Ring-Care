/**
 * The record of a stranger/uniform decision (F2.4): a guardian saw an unknown person
 * and the deterministic rule judged whether they were expected. Append-only — this is
 * the audit trail that makes rule #5 provable ("false 'responder expected' suppression
 * is impossible without a system-initiated emergency in the log") and satisfies rule #7
 * (every such judgement is logged). Labels and ids only, never a face crop (rule #1).
 */
export interface SightingDecision {
  id: string;
  familyId: string;
  deviceId: string;
  /** The triggering `person.unknown` event id; also the idempotency key. */
  eventId: string;
  /** When the device saw the person (device clock, ISO). */
  at: string;
  /** The device's clothing read. Context for priority — never grounds for trust. */
  uniformed: boolean;
  decision: SightingKind;
  reason: SightingReason;
  /** The matched visit's label when reason is expected_visit; otherwise null. */
  visitLabel: string | null;
  recordedAt: string;
}

/** Expected (suppress the alarm, record why) or a stranger (raise an alert). */
export type SightingKind = 'expected' | 'stranger';

/**
 * Why the decision went the way it did. `system_emergency` and `expected_visit` are the
 * ONLY grounds for "expected"; `none` means nothing justified trust, so it is a stranger.
 * A uniform is never a reason here — it is context, not a credential (rule #5).
 */
export type SightingReason = 'system_emergency' | 'expected_visit' | 'none';
