/**
 * Internal event bus contract.
 *
 * Modules communicate through this in-process bus (@nestjs/event-emitter) and
 * NEVER by calling each other over HTTP. This file is the single registry of
 * cross-module event names and their payload shapes, so a producer and a consumer
 * in different modules stay in sync at compile time.
 */

export const InternalEvent = {
  DeviceRegistered: 'device.registered',
  FamilyCreated: 'family.created',
  GuardianOffline: 'guardian.offline',
  CanaryFailed: 'canary.failed',
  FallDetected: 'fall.detected',
  VoiceCheckinReported: 'voice.checkin_reported',
  PersonUnknown: 'person.unknown',
  ZoneEntered: 'zone.entered',
  ZoneExited: 'zone.exited',
  DeviceCommandIssued: 'device.command_issued',
  RingMotionDetected: 'ring.motion_detected',
  RingButtonPressed: 'ring.button_pressed',
} as const;

export type InternalEvent = (typeof InternalEvent)[keyof typeof InternalEvent];

export interface DeviceRegisteredPayload {
  deviceId: string;
  familyId: string;
  registeredAt: string;
}

export interface FamilyCreatedPayload {
  familyId: string;
  createdAt: string;
}

export interface GuardianOfflinePayload {
  deviceId: string;
  /** Epoch ms of the last heartbeat, or null if never seen. */
  lastSeenAt: number | null;
  /** Epoch ms when the offline transition was detected. */
  detectedAt: number;
}

export interface CanaryFailedPayload {
  ranAt: string;
  latencyMs: number;
  error: string;
}

/**
 * A guardian device reported a confirmed fall. The events module emits this when a
 * `fall.confirmed` event is newly ingested; the escalation module listens and starts
 * the durable ladder. Carries labels/ids only (rule #1) — never media.
 */
export interface FallDetectedPayload {
  deviceId: string;
  /** The ingested event's id, recorded as the incident's triggering event. */
  eventId: string;
  /** The event type that triggered this, e.g. "fall.confirmed". */
  type: string;
  occurredAt: string;
}

/**
 * A guardian device reported the result of its on-device safety voice check-in (F1.3).
 * After a suspected fall the guardian asks "Are you okay?" in the elder's language and
 * listens; the events module emits this when a `voice.checkin_result` is newly ingested,
 * and the escalation module signals the incident's workflow with the elder's answer.
 * Labels only (rule #1) — never the audio; the recognition ran on-device.
 */
export interface VoiceCheckinReportedPayload {
  deviceId: string;
  /** The ingested event's id. */
  eventId: string;
  occurredAt: string;
  /** What the guardian heard: the elder is fine, in distress, or gave no answer. */
  result: 'i_am_fine' | 'distress' | 'silence';
}

/**
 * A guardian device saw a person it does not recognize (F2.4). The events module emits
 * this when a `person.unknown` event is newly ingested; the escalation module's
 * stranger evaluator decides whether the person was expected (an active system-initiated
 * emergency or a pre-logged visit) or is a stranger to alert on.
 *
 * Carries labels/ids only (rule #1) — never a face crop. `uniformed` is a boolean the
 * device derived from clothing; it may only raise a stranger alert's priority, never
 * grant trust (rule #5: uniforms are context, never trust).
 */
export interface PersonUnknownPayload {
  deviceId: string;
  /** The ingested event's id; the decision references it. */
  eventId: string;
  occurredAt: string;
  /** The device's clothing read: does the person appear to be in a uniform? */
  uniformed: boolean;
}

/**
 * A guardian device saw a person cross into one of the family's zones (F2.3). The
 * events module emits this when a `zone.entry` event is newly ingested; the zone
 * evaluator turns an entry into a `hazard` zone (stove, stairs) into a family alert.
 * Coordinates and ids only (rule #1) — the geometry ran on-device, never a frame.
 */
export interface ZoneEnteredPayload {
  deviceId: string;
  /** The ingested event's id. */
  eventId: string;
  occurredAt: string;
  /** Which zone was entered — the id the device was synced from the zones registry. */
  zoneId: string;
}

/**
 * A guardian device reported a person leaving one of the family's zones (F2.3). The
 * events module emits this when a `zone.exit` is newly ingested; the wander watcher
 * uses an exit from a `door` zone to start a return watch. Ids and coordinates only
 * (rule #1).
 */
export interface ZoneExitedPayload {
  deviceId: string;
  eventId: string;
  occurredAt: string;
  zoneId: string;
}

/**
 * A caregiver issued a backend → device command (F2.6), e.g. a remote wipe. The fleet
 * module emits this after recording the command to the append-only trail; the device
 * link listens and publishes it to the guardian's command topic. Carries ids and the
 * command kind only.
 */
export interface DeviceCommandIssuedPayload {
  deviceId: string;
  /** The command record's id; the device acks and de-duplicates on it. */
  commandId: string;
  command: 'wipe';
  issuedAt: string;
}

/** Where a linked Ring camera sits in the elder's home; set by the caregiver. */
export type RingPlacement = 'front_door' | 'indoor' | 'other';

/**
 * A linked Ring camera reported activity (motion or a doorbell press). The ring module
 * emits this after recording the webhook to its append-only `ring_events` trail; the
 * escalation and visits logic listen. Labels and ids only (rule #1): Ring video never
 * reaches our backend. `subType` is Ring's Smart Alert label when available
 * ('human' | 'vehicle' | 'package_delivery' | 'other_motion' | 'motion'), else null.
 */
export interface RingActivityPayload {
  familyId: string;
  /** Our ring_cameras row id. */
  ringCameraId: string;
  /** Our append-only ring_events row id; consumers reference it as the triggering event. */
  ringEventId: string;
  placement: RingPlacement;
  subType: string | null;
  /** When the event happened, as Ring reported it (shown to the family). */
  occurredAt: string;
  /**
   * When we received and recorded it (ring_events.received_at, our wall clock). Used for
   * de-duplication, so a replayed or simulated event with an old occurredAt is still new.
   */
  receivedAt: string;
  /** 'simulator' when the signed event came from scripts/ring-sim (labelled in the UI). */
  source: 'ring' | 'simulator';
}

/** Maps each event name to its payload type for type-safe emit/handle helpers. */
export interface InternalEventPayloads {
  [InternalEvent.DeviceRegistered]: DeviceRegisteredPayload;
  [InternalEvent.FamilyCreated]: FamilyCreatedPayload;
  [InternalEvent.GuardianOffline]: GuardianOfflinePayload;
  [InternalEvent.CanaryFailed]: CanaryFailedPayload;
  [InternalEvent.FallDetected]: FallDetectedPayload;
  [InternalEvent.VoiceCheckinReported]: VoiceCheckinReportedPayload;
  [InternalEvent.PersonUnknown]: PersonUnknownPayload;
  [InternalEvent.ZoneEntered]: ZoneEnteredPayload;
  [InternalEvent.RingMotionDetected]: RingActivityPayload;
  [InternalEvent.RingButtonPressed]: RingActivityPayload;
  [InternalEvent.ZoneExited]: ZoneExitedPayload;
  [InternalEvent.DeviceCommandIssued]: DeviceCommandIssuedPayload;
}
