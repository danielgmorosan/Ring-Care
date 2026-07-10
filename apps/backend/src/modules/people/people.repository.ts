import type { HouseholdRole, Person } from './person.entity';

/** A new person to enroll in a family's roster. */
export interface NewPerson {
  familyId: string;
  title: string;
  role: HouseholdRole;
  notes: string | null;
}

/** Editable fields of an enrolled person (never id/familyId/active/createdAt). */
export type PersonUpdate = Partial<Pick<Person, 'title' | 'role' | 'notes'>>;

/**
 * The per-family roster of enrolled people. Editable configuration (unlike the
 * append-only incident trail). Removal is a soft deactivate so historical
 * `person.known` events still resolve to a role; rows are never deleted.
 */
export interface PeopleRepository {
  /** Active people only, oldest first. */
  listByFamily(familyId: string): Promise<Person[]>;
  /** Any person by id (active or not) so callers can 404 precisely. */
  findById(familyId: string, id: string): Promise<Person | null>;
  create(person: NewPerson): Promise<Person>;
  update(familyId: string, id: string, patch: PersonUpdate): Promise<Person | null>;
  /** Soft-delete: mark inactive. Returns false if not found or already inactive. */
  deactivate(familyId: string, id: string): Promise<boolean>;
}

export const PEOPLE_REPOSITORY = Symbol('PEOPLE_REPOSITORY');
