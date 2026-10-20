import type { VisitArrival } from './visit-arrival.entity';

export type NewVisitArrival = Omit<VisitArrival, 'id'>;

/**
 * Append-only store of visit arrivals. The only write is record(); no update or delete
 * (rule #2), enforced at the database level by migration 1720000000029. One arrival per
 * visit: a second record for the same visit is a no-op that reports false.
 */
export interface VisitArrivalRepository {
  /** Record the arrival; false if the visit already has one (nothing is written). */
  record(arrival: NewVisitArrival): Promise<boolean>;
  findByVisit(visitId: string): Promise<VisitArrival | null>;
  /** A family's arrivals, newest first. */
  listByFamily(familyId: string): Promise<VisitArrival[]>;
}

export const VISIT_ARRIVAL_REPOSITORY = Symbol('VISIT_ARRIVAL_REPOSITORY');
