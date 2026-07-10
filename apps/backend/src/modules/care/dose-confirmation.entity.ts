/**
 * A confirmation that the elder took a medication dose (F3.4). The guardian speaks the
 * reminder and the elder confirms by voice; the device reports it here. Append-only —
 * an adherence record the family can see and, later, the missed-dose alert reads.
 * Labels and times only, never audio (rule #1).
 */
export interface DoseConfirmation {
  id: string;
  /** Client-generated id so a replayed confirmation records once. */
  doseId: string;
  medicationId: string;
  familyId: string;
  /** Which scheduled dose, as the "HH:MM" slot from the medication's times; null if ad-hoc. */
  slot: string | null;
  /** When the elder confirmed (device time). */
  confirmedAt: string;
  createdAt: string;
}
