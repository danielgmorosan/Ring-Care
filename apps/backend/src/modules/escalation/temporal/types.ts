/**
 * Shared, side-effect-free types for the escalation engine. Safe to import from
 * both the deterministic workflow (sandboxed) and ordinary Nest code — no Node,
 * Nest, or IO imports may ever be added here.
 */

export interface QuietHours {
  /** "HH:MM" local start of the quiet window. */
  start: string;
  /** "HH:MM" local end of the quiet window (may wrap past midnight). */
  end: string;
  /** If true, a confirmed fall still wakes this contact during quiet hours. */
  wakeForConfirmedFallOnly: boolean;
}

export interface EscalationContact {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  pushToken: string | null;
  /** Position in the chain; lower is contacted first. */
  priority: number;
  quietHours: QuietHours | null;
}

/** Result of the on-device voice check-in (F1.3 feeds this as a signal). */
export type VoiceCheckinResult = 'i_am_fine' | 'distress' | 'silence' | 'pending';

export interface EscalationInput {
  incidentId: string;
  familyId: string;
  /** The guardian behind the incident, or null for a family-level sensor (a Ring camera). */
  deviceId: string | null;
  /** Why we're escalating, e.g. "fall.suspected". Selects the rule set (escalationRulesFor). */
  reason: string;
  /** Whether detection confirmed a fall — governs quiet-hours override. */
  confirmedFall: boolean;
  /** Ordered contact chain (sorted by priority). */
  contacts: EscalationContact[];
  /** Registered caregiver device tokens to critical-alert when help is summoned. */
  pushDevices: string[];
  /** Seconds to ring each contact before moving on. */
  ackWindowSeconds: number;
  /** Voice check-in result if already known, else 'pending'. */
  initialCheckin: VoiceCheckinResult;
  /**
   * Optional family-facing wording, built deterministically outside the workflow (never by
   * an LLM). Absent for falls, which keep the original generic texts.
   */
  messages?: EscalationMessages;
  /**
   * The household's IANA timezone (e.g. "Europe/Lisbon"). Contacts' quiet hours are
   * household-local clock times, so the workflow reads its own clock in this zone.
   * Absent on incidents started before this field existed: those keep UTC.
   */
  timeZone?: string;
}

export interface EscalationMessages {
  /** The critical push to the caregivers' devices when the ladder starts. */
  device?: string;
  /** The SMS and push to the whole chain when nobody handled it. */
  unanswered?: string;
  /**
   * What a family call says aloud, before "Press 1 if you are handling this." Absent for
   * falls, which keep the generic call text.
   */
  call?: string;
}

/**
 * The reason-specific rule set the deterministic workflow runs. Derived from the reason
 * inside the workflow (a pure lookup), so a caller can never start, say, a door incident
 * that dials emergency services.
 */
export interface EscalationRules {
  /** Wait for the elder's on-device voice check-in before alerting anyone (falls). */
  voiceCheckin: boolean;
  /** Notify emergency services (112) when nobody handled the incident. */
  emergencyServices: boolean;
  /**
   * Wake contacts even inside their quiet hours, as a confirmed fall does. A parent
   * leaving home at night is exactly when the family must be woken.
   */
  wakesThroughQuietHours: boolean;
}

/** The fall ladder: voice check-in gate, family calls, then emergency services. */
export const DEFAULT_ESCALATION_RULES: Readonly<EscalationRules> = Object.freeze({
  voiceCheckin: true,
  emergencyServices: true,
  // Falls override quiet hours only once confirmed (input.confirmedFall), as before.
  wakesThroughQuietHours: false,
});

/** Ring front-door activity inside the household's night window (decision 0011). */
export const NIGHT_DOOR_REASON = 'door.night_activity';

/**
 * Family and trusted contacts only. There is no fall to check in about, so no voice gate;
 * and the Ring program forbids us from dispatching emergency services (decision 0011), so
 * the ladder ends once everyone on the chain has been reached by text and push.
 */
export const FAMILY_ONLY_ESCALATION_RULES: Readonly<EscalationRules> = Object.freeze({
  voiceCheckin: false,
  emergencyServices: false,
  wakesThroughQuietHours: true,
});

const RULES_BY_REASON: Readonly<Record<string, Readonly<EscalationRules>>> = Object.freeze({
  [NIGHT_DOOR_REASON]: FAMILY_ONLY_ESCALATION_RULES,
});

/** The rule set for an incident reason; anything unlisted runs the full fall ladder. */
export function escalationRulesFor(reason: string): Readonly<EscalationRules> {
  return Object.prototype.hasOwnProperty.call(RULES_BY_REASON, reason)
    ? RULES_BY_REASON[reason]!
    : DEFAULT_ESCALATION_RULES;
}

export type IncidentStepKind =
  | 'incident_opened'
  | 'voice_checkin_result'
  | 'call_placed'
  | 'call_answered'
  | 'call_no_answer'
  | 'sms_sent'
  | 'push_sent'
  | 'emergency_notified'
  | 'quiet_hours_skipped'
  // A caregiver acknowledged from the app (provisional, under a re-escalation timer, 0008).
  | 'caregiver_acknowledged'
  // The caregiver's acknowledgement lapsed without an all-clear; escalation resumed (0008).
  | 'acknowledgement_lapsed'
  // A family-only ladder (no emergency step) reached everyone on the chain and ended.
  | 'family_alerted'
  | 'stood_down';

export interface RecordStepInput {
  incidentId: string;
  seq: number;
  kind: IncidentStepKind;
  contactId: string | null;
  detail: Record<string, unknown>;
}

export interface PlaceCallInput {
  incidentId: string;
  contact: EscalationContact;
  ringSeconds: number;
  /** The words spoken on the call (deterministic, never an LLM). Absent: the generic text. */
  message?: string;
}

export interface PlaceCallResult {
  /** A human picked up and is engaged. Only ever true when the adapter can know it. */
  answered: boolean;
  /**
   * The call asks the contact to press 1, and that confirmation arrives later as the
   * contactConfirmed signal. The workflow then waits the ack window before moving on.
   * False or absent: move on immediately (mock adapter, Twilio without callbacks).
   */
  awaitsConfirmation?: boolean;
}

export interface ContactMessageInput {
  incidentId: string;
  contact: EscalationContact;
  message: string;
}

/** A critical alert to a raw registered device token (a caregiver's app device). */
export interface DeviceAlertInput {
  incidentId: string;
  token: string;
  message: string;
}

export interface NotifyEmergencyInput {
  incidentId: string;
  summary: string;
}

/**
 * Activity surface the workflow depends on. The implementation (Twilio, DB) lives
 * outside the sandbox; the workflow only ever sees this interface.
 */
export interface EscalationActivities {
  recordStep(input: RecordStepInput): Promise<void>;
  placeCall(input: PlaceCallInput): Promise<PlaceCallResult>;
  sendSms(input: ContactMessageInput): Promise<void>;
  pushCriticalAlert(input: ContactMessageInput): Promise<void>;
  pushDeviceAlert(input: DeviceAlertInput): Promise<void>;
  notifyEmergency(input: NotifyEmergencyInput): Promise<void>;
}

export type EscalationOutcome =
  | 'stood_down'
  | 'acknowledged'
  | 'emergency_notified'
  // A family-only ladder (e.g. door.night_activity) texted and pushed the whole chain.
  | 'family_alerted';

export interface EscalationResult {
  outcome: EscalationOutcome;
  acknowledgedByContactId: string | null;
  steps: number;
}

/** Signal names (delivering the check-in result and out-of-band acknowledgement). */
export const CHECKIN_SIGNAL = 'voiceCheckinResult';
export const ACK_SIGNAL = 'contactAcknowledged';
/** A caregiver acknowledged from the app ("I'm handling this"); provisional (0008). */
export const CAREGIVER_ACK_SIGNAL = 'caregiverAcknowledged';
/** The caregiver's "All clear" that resolves an acknowledged incident (0008). */
export const RESOLVE_SIGNAL = 'incidentResolved';
/** A called contact pressed 1 on the call: "I am handling this" (0003 follow-up). */
export const CONTACT_CONFIRMED_SIGNAL = 'contactConfirmed';

/** The call providers that can report a press 1 (0003 Twilio, 0014 Amazon Connect). */
export const CALL_PROVIDERS = ['twilio', 'connect'] as const;
export type CallProviderName = (typeof CALL_PROVIDERS)[number];

/** How long the workflow waits for a pending voice check-in before proceeding. */
export const CHECKIN_WAIT_SECONDS = 20;
/**
 * After a caregiver acknowledges from the app, how long we hold escalation waiting for their
 * "All clear" (0008). If it does not arrive, the acknowledgement lapses and the ladder resumes
 * to full emergency escalation — a one-tap ack can only ever delay help, never suppress it.
 */
export const ACK_RESOLVE_WINDOW_SECONDS = 300;

/** Parse "HH:MM" to minutes since midnight; returns null if malformed. */
export function parseHhMm(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** True if `nowMinutes` (minutes since midnight) is inside [start, end), handling wrap past midnight. */
export function withinWindow(start: string, end: string, nowMinutes: number): boolean {
  const s = parseHhMm(start);
  const e = parseHhMm(end);
  if (s === null || e === null) return false;
  if (s === e) return false;
  return s < e ? nowMinutes >= s && nowMinutes < e : nowMinutes >= s || nowMinutes < e;
}

/**
 * Whether a contact should be skipped right now because of their quiet-hours
 * contract. A confirmed fall overrides quiet hours for contacts who opted into
 * that ("wake me only for confirmed falls").
 */
export function shouldSkipForQuietHours(
  contact: EscalationContact,
  confirmedFall: boolean,
  nowMinutes: number,
): boolean {
  const qh = contact.quietHours;
  if (!qh) return false;
  if (confirmedFall && qh.wakeForConfirmedFallOnly) return false;
  return withinWindow(qh.start, qh.end, nowMinutes);
}

/**
 * Minutes since local midnight (0–1439) of an instant in an IANA timezone. Pure: the
 * workflow feeds it workflow time (Date.now() is deterministic inside the Temporal
 * sandbox), so a replay computes exactly what the original run did. An unknown or
 * missing zone falls back to UTC.
 */
export function localMinutesOfDay(epochMs: number, timeZone: string | null | undefined): number {
  const utc = (): number => {
    const d = new Date(epochMs);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  if (!timeZone || timeZone === 'UTC') return utc();
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(epochMs));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 'NaN') % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 'NaN');
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return utc();
    return hour * 60 + minute;
  } catch {
    // RangeError for an unknown zone: keep the old UTC behaviour rather than fail the ladder.
    return utc();
  }
}
