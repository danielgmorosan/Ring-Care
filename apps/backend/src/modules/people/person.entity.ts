/**
 * A person the household enrolls so the guardian knows who belongs (F2.2).
 *
 * The backend holds ONLY the roster: a household title and a behaviour role. Face
 * embeddings and enrollment photos never reach the cloud — they live in the phone's
 * hardware-backed keystore, keyed by this person's id (CONTRIBUTING.md rule #4). This table
 * is the source of truth for "who belongs"; recognition runs on device against the
 * local gallery and emits `person.known` referencing a personId from here.
 *
 * Editable configuration, not the append-only safety trail. Removal is a soft
 * deactivate (active=false) so historical `person.known` events still resolve to a
 * role for narration; the row is never deleted.
 */
export interface Person {
  id: string;
  familyId: string;
  /**
   * A household title, not a legal name: "Grandfather", "Nurse", "Family member 1".
   * What leaves the device is the role and this person's id, never this string.
   */
  title: string;
  /** Behaviour role. Drives how the guardian treats seeing this person (F2.4). */
  role: HouseholdRole;
  notes: string | null;
  /** False once deactivated; deactivated people are hidden but never deleted. */
  active: boolean;
  createdAt: string;
}

/**
 * Who a person is to the household, in the terms that drive guardian behaviour.
 * A bounded set (not free text like escalation-contact roles) because F2.4's
 * stranger/uniform logic branches on it: the resident is the protected party, family
 * and friends are notify-not-alarm, a caregiver is expected on a schedule.
 */
export const HOUSEHOLD_ROLES = ['resident', 'family', 'caregiver', 'friend', 'other'] as const;

export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];
