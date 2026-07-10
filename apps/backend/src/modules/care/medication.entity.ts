/**
 * A medication the elder takes, managed by the caregiver (F3.4). This is editable
 * care configuration, not the append-only safety trail. No medical advice is derived
 * here — it is a schedule the family keeps.
 */
export interface Medication {
  id: string;
  familyId: string;
  /** What to take, e.g. "Bisoprolol". */
  name: string;
  /** How much, e.g. "5mg". Optional. */
  dosage: string | null;
  /** Times of day to take it, "HH:MM" (may be empty). */
  times: string[];
  notes: string | null;
  createdAt: string;
}
