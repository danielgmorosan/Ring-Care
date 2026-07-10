import type { SightingDecision, SightingKind, SightingReason } from './sighting-decision.entity';

/** A stranger/uniform decision to record. `id`/`recordedAt` are assigned by the store. */
export interface NewSightingDecision {
  familyId: string;
  deviceId: string;
  eventId: string;
  at: string;
  uniformed: boolean;
  decision: SightingKind;
  reason: SightingReason;
  visitLabel: string | null;
}

/**
 * Append-only store of stranger/uniform decisions (F2.4). The only write is append();
 * no update or delete (rule #2), enforced at the database level. Appends are idempotent
 * on eventId so a replayed sighting records once.
 */
export interface SightingRepository {
  append(decision: NewSightingDecision): Promise<void>;
  /** A family's sightings, newest first (the read side for the family surface). */
  listByFamily(familyId: string): Promise<SightingDecision[]>;
}

export const SIGHTING_REPOSITORY = Symbol('SIGHTING_REPOSITORY');
