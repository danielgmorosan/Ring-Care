import type { RecordStepInput } from './temporal/types';

/**
 * Step kinds that mark an incident as resolved: the elder said they were fine, a
 * contact answered, emergency services were notified, or a family-only ladder (no
 * emergency step, e.g. door.night_activity) reached the whole chain. An incident with
 * none of these is still active. (Mirrors the outcome derivation in IncidentsQueryService.)
 */
export const TERMINAL_STEP_KINDS = [
  'stood_down',
  'call_answered',
  'emergency_notified',
  'family_alerted',
] as const;

/** The immutable opening record of an incident. Lifecycle lives in append-only steps. */
export interface Incident {
  id: string;
  familyId: string;
  /** The guardian behind it, or null for a family-level sensor (a Ring camera, 0011). */
  deviceId: string | null;
  /** The triggering event: an event_stream id, or a ring_events id for Ring incidents. */
  triggeringEventId: string | null;
  reason: string;
  openedAt: string;
}

/**
 * One ladder step as read back for display. The contact name is resolved from the
 * contacts table at read time (null if the step had no contact or it was later
 * removed); occurredAt is only known on the Postgres path — in-memory steps carry
 * no timestamp.
 */
export interface IncidentStepView {
  seq: number;
  kind: string;
  contactName: string | null;
  /** The contact's role ("daughter"), for narration that uses roles not names. */
  contactRole: string | null;
  detail: Record<string, unknown>;
  occurredAt: string | null;
}

/**
 * Append-only incident store. open() writes the opening record; appendStep() adds
 * one immutable ladder step. appendStep is idempotent on (incidentId, seq) so
 * Temporal activity retries and workflow replays never duplicate a step.
 *
 * The list/find/read methods are the family-facing read side (Timeline). They never
 * mutate; SELECT is unaffected by the append-only triggers.
 */
export interface IncidentRepository {
  open(incident: Incident): Promise<void>;
  appendStep(step: RecordStepInput): Promise<void>;
  countSteps(incidentId: string): Promise<number>;
  listStepKinds(incidentId: string): Promise<string[]>;
  /** Incidents for a family, newest first. */
  listByFamily(familyId: string): Promise<Incident[]>;
  /** One incident by id, or null. Ownership is checked by the caller. */
  findById(incidentId: string): Promise<Incident | null>;
  /** Steps for an incident, in ladder order, with contact names resolved. */
  listSteps(incidentId: string): Promise<IncidentStepView[]>;
  /**
   * Whether the device has an incident that has not yet reached a terminal outcome.
   * Used to de-duplicate escalations: a suspected fall that is then confirmed must
   * not open a second incident, but a genuine new fall after the first resolved must.
   */
  hasActiveForDevice(deviceId: string): Promise<boolean>;
  /**
   * The device's most recent still-active incident, or null. Used to route a device's
   * on-device voice check-in result (F1.3) to the incident its fall opened.
   */
  findActiveForDevice(deviceId: string): Promise<Incident | null>;
  /**
   * Whether the device has an incident that reached the emergency-notified step and
   * opened at or after `since` (ISO). Unlike hasActiveForDevice, which treats
   * emergency_notified as terminal, this stays true through the window after a 112
   * call — emergency responders arrive after the call, and rule #5 lets the stranger
   * evaluator treat a uniformed unknown as an expected responder only while a
   * system-initiated emergency is recent.
   */
  hasRecentEmergencyForDevice(deviceId: string, since: string): Promise<boolean>;
}

export const INCIDENT_REPOSITORY = Symbol('INCIDENT_REPOSITORY');
