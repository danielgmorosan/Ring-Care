import type { Medication } from './medication.entity';

/** A new medication to add to a family's schedule. */
export interface NewMedication {
  familyId: string;
  name: string;
  dosage: string | null;
  times: string[];
  notes: string | null;
}

/** Editable fields of an existing medication. */
export type MedicationUpdate = Partial<Omit<Medication, 'id' | 'familyId' | 'createdAt'>>;

/**
 * The per-family medication schedule. Editable configuration (unlike the append-only
 * incident trail): families add, remove, and adjust as care changes.
 */
export interface MedicationRepository {
  listByFamily(familyId: string): Promise<Medication[]>;
  findById(familyId: string, id: string): Promise<Medication | null>;
  create(medication: NewMedication): Promise<Medication>;
  update(familyId: string, id: string, patch: MedicationUpdate): Promise<Medication | null>;
  delete(familyId: string, id: string): Promise<boolean>;
}

export const MEDICATION_REPOSITORY = Symbol('MEDICATION_REPOSITORY');
