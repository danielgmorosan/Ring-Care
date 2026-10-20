/**
 * What a front-door Ring event means for the family (decision 0011). The value the Ring
 * activity feed shows as `interpretation`.
 */
export type RingInterpretation = 'night_door' | 'visit_arrival';

/**
 * The judgement made for one Ring event. Every branch of the rule is named, so a
 * suppression (no incident) always has its reason on record (rules #3 and #7).
 */
export type RingCareOutcome =
  /** Night window, a person, no visit: opened a door.night_activity incident (the ladder). */
  | 'incident_opened'
  /** Repeated activity while a night door incident is open or recent: joined it. */
  | 'joined_incident'
  /** Night door activity, but the escalation engine is unavailable: a family alert instead. */
  | 'alerted_without_engine'
  /** A person at the door inside an expected visit's window: recorded the arrival. */
  | 'arrival_recorded'
  /** A person at the door during a visit that already has its arrival: nothing to do. */
  | 'during_visit'
  /** Motion that is not a person (vehicle, package delivery, plain motion): timeline only. */
  | 'not_a_person'
  /** A person at the door outside the night window: timeline only. */
  | 'daytime';

export interface RingCareDecision {
  ringEventId: string;
  familyId: string;
  /** When the Ring event happened. */
  at: string;
  interpretation: RingInterpretation | null;
  outcome: RingCareOutcome;
  incidentId: string | null;
  visitId: string | null;
  /**
   * When the decision was recorded (our wall clock), set by the repository on read. The
   * de-duplication anchor: Ring's own `at` can repeat (a replay, the demo simulator).
   */
  recordedAt?: string;
}

/**
 * Append-only record of Ring care decisions (migration 1720000000029). One per Ring event:
 * record() is idempotent on ringEventId and reports false for a repeat.
 */
export interface RingCareDecisionRepository {
  record(decision: RingCareDecision): Promise<boolean>;
  findByRingEvent(ringEventId: string): Promise<RingCareDecision | null>;
  /**
   * The family's most recent decision that started a night door response (an incident, or
   * the no-engine alert), or null. The de-duplication anchor for repeated motion.
   */
  latestNightDoorOpener(familyId: string): Promise<RingCareDecision | null>;
}

export const RING_CARE_DECISION_REPOSITORY = Symbol('RING_CARE_DECISION_REPOSITORY');

/** Outcomes that started a night door response (the de-duplication anchors). */
export const NIGHT_DOOR_OPENER_OUTCOMES: readonly RingCareOutcome[] = [
  'incident_opened',
  'alerted_without_engine',
];
