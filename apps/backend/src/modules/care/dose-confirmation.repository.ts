import type { DoseConfirmation } from './dose-confirmation.entity';

/** A confirmation to record. `id`/`createdAt` are assigned by the store. */
export interface NewDoseConfirmation {
  doseId: string;
  medicationId: string;
  familyId: string;
  slot: string | null;
  confirmedAt: string;
}

/**
 * Append-only store of medication dose confirmations (F3.4). The only write is
 * append() (rule #2). Idempotent on doseId so a replayed confirmation records once.
 */
export interface DoseConfirmationRepository {
  append(confirmation: NewDoseConfirmation): Promise<void>;
  /** A medication's confirmations, newest first. Family-scoped. */
  listByMedication(familyId: string, medicationId: string): Promise<DoseConfirmation[]>;
}

export const DOSE_CONFIRMATION_REPOSITORY = Symbol('DOSE_CONFIRMATION_REPOSITORY');
