import { CheckinLanguage } from './checkin-language';
import type { ElderRelation } from './elder';
import { Family } from './family.entity';

/**
 * Repository port. The service depends on this interface, not on a database. The
 * in-memory adapter satisfies it today; F0.2 swaps in a Postgres/TimescaleDB
 * adapter with zero change to the service or controller.
 */
export interface FamilyRepository {
  create(family: Family): Promise<Family>;
  findById(id: string): Promise<Family | null>;
  findAll(): Promise<Family[]>;
  /** Applies a partial update of the mutable fields. Null if the family is unknown. */
  update(id: string, patch: FamilyPatch): Promise<Family | null>;
}

/** The mutable fields of a family. All optional; callers send only what changed. */
export interface FamilyPatch {
  name?: string;
  timezone?: string;
  checkinLanguage?: CheckinLanguage;
  /** Undefined leaves it unchanged; null clears it. */
  elderName?: string | null;
  /** Undefined leaves it unchanged; null clears it. */
  elderRelation?: ElderRelation | null;
}

/** DI token for the FamilyRepository port. */
export const FAMILY_REPOSITORY = Symbol('FAMILY_REPOSITORY');
