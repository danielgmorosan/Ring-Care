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
  deviceId: string;
  /** Why we're escalating, e.g. "fall.suspected". */
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
  placeCall(input: PlaceCallInput): Promise<{ answered: boolean }>;
  sendSms(input: ContactMessageInput): Promise<void>;
  pushCriticalAlert(input: ContactMessageInput): Promise<void>;
  pushDeviceAlert(input: DeviceAlertInput): Promise<void>;
  notifyEmergency(input: NotifyEmergencyInput): Promise<void>;
}

export type EscalationOutcome = 'stood_down' | 'acknowledged' | 'emergency_notified';

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
