/**
 * An appointment in the elder's calendar, managed by the caregiver (F3.4). Editable
 * care configuration, not the append-only safety trail.
 */
export interface Appointment {
  id: string;
  familyId: string;
  /** What it is, e.g. "Dr. Almeida — cardiology". */
  title: string;
  /** When, as an ISO 8601 datetime. */
  at: string;
  location: string | null;
  notes: string | null;
  createdAt: string;
}
