import type { ExpectedVisit } from './visit.entity';

/** A new expected visit to log for a family. */
export interface NewVisit {
  familyId: string;
  visitorLabel: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
}

/** Editable fields of an expected visit (never id/familyId/createdAt). */
export type VisitUpdate = Partial<
  Pick<ExpectedVisit, 'visitorLabel' | 'startsAt' | 'endsAt' | 'notes'>
>;

/**
 * The per-family list of pre-logged expected visits. Editable configuration (unlike
 * the append-only incident trail). The stranger evaluator (F2.4) reads
 * `findCovering` to decide whether an unknown person was expected.
 */
export interface VisitsRepository {
  /** Soonest window first. */
  listByFamily(familyId: string): Promise<ExpectedVisit[]>;
  findById(familyId: string, id: string): Promise<ExpectedVisit | null>;
  /** Visits whose window contains `at` (startsAt <= at <= endsAt), soonest first. */
  findCovering(familyId: string, at: string): Promise<ExpectedVisit[]>;
  create(visit: NewVisit): Promise<ExpectedVisit>;
  update(familyId: string, id: string, patch: VisitUpdate): Promise<ExpectedVisit | null>;
  delete(familyId: string, id: string): Promise<boolean>;
}

export const VISITS_REPOSITORY = Symbol('VISITS_REPOSITORY');
