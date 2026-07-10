import { CheckinLanguage } from './checkin-language';

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
  createdAt: string;
}
