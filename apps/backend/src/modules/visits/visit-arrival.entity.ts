/**
 * An expected visitor arrived (decision 0011). Recorded when a front-door Ring doorbell
 * press or `human` motion lands inside an expected visit's window. Append-only (rule #2):
 * one immutable record per visit. The visitor label is a copy taken at arrival time, so
 * editing or deleting the visit later never rewrites what the family was told.
 */
export interface VisitArrival {
  id: string;
  visitId: string;
  familyId: string;
  /** The ring_events row that marked the arrival. */
  ringEventId: string;
  /** The visit's label at arrival time ("Anna", "Nurse"). */
  visitorLabel: string;
  /** When the visitor arrived (the Ring event's time). */
  arrivedAt: string;
}
