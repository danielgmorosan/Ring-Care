import type { EscalationContact } from './temporal/types';

/** A new contact to add to a family's escalation chain. */
export interface NewContact extends Omit<EscalationContact, 'id'> {
  familyId: string;
}

/** Editable fields of an existing contact. */
export type ContactUpdate = Partial<Omit<EscalationContact, 'id'>>;

/**
 * The per-family escalation contact chain. This is editable configuration (unlike
 * the append-only incident trail): families reorder contacts and tune quiet hours
 * as their situation changes.
 */
export interface ContactRepository {
  listByFamily(familyId: string): Promise<EscalationContact[]>;
  findById(familyId: string, contactId: string): Promise<EscalationContact | null>;
  create(contact: NewContact): Promise<EscalationContact>;
  update(
    familyId: string,
    contactId: string,
    update: ContactUpdate,
  ): Promise<EscalationContact | null>;
  delete(familyId: string, contactId: string): Promise<boolean>;
  /**
   * Erase identifying data from a family's contacts in place (GDPR Art. 17). Rows
   * are kept, not deleted, because the append-only incident trail references them
   * (incident_steps.contact_id) — redaction removes the identity while leaving the
   * audit skeleton intact. See docs/decisions/0005.
   */
  redactByFamily(familyId: string): Promise<void>;
}

export const CONTACT_REPOSITORY = Symbol('CONTACT_REPOSITORY');
