import { CheckinLanguage } from './checkin-language';
import type { ElderRelation } from './elder';

/**
 * A family is the account boundary: the caregiver(s) who receive alerts and manage
 * the system on behalf of a protected elder. Persistence-agnostic domain shape;
 * the TimescaleDB-backed table arrives in F0.2.
 */
export interface Family {
  id: string;
  /** Display name for the household, e.g. "Silva family". */
  name: string;
  /** IANA timezone of the elder's home, e.g. "Europe/Lisbon". "Today" is local to it. */
  timezone: string;
  /** Elder-facing voice check-in language (a safety setting; must match the elder). */
  checkinLanguage: CheckinLanguage;
  /**
   * The protected person's display name, e.g. "Maria". Null when unset. Shown to the
   * family only; never sent to an AI provider (roles only).
   */
  elderName: string | null;
  /** How the caregiver relates to them, e.g. "mother". Null when unset. */
  elderRelation: ElderRelation | null;
  createdAt: string;
}
