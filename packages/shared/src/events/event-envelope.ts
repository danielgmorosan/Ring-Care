import { z } from 'zod';

/**
 * The event envelope is the ONLY shape that may leave a guardian device.
 *
 * Non-negotiable rule #1 (see CONTRIBUTING.md): frames are processed in memory on the
 * device and discarded. Events that leave the device carry labels, timestamps,
 * keypoints, and confidences — never pixels, never raw audio. This schema is the
 * enforcement point in shared code: if a payload cannot be expressed here, it must
 * not be transmitted.
 */

/** Categories of derived events a guardian device may emit. Extended as features land. */
export const EventType = {
  Heartbeat: 'heartbeat',
  FallSuspected: 'fall.suspected',
  FallConfirmed: 'fall.confirmed',
  VoiceCheckinResult: 'voice.checkin_result',
  ZoneEntry: 'zone.entry',
  ZoneExit: 'zone.exit',
  PersonKnown: 'person.known',
  PersonUnknown: 'person.unknown',
  GuardianOffline: 'guardian.offline',
  VlmVerdict: 'vlm.verdict',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export const eventTypeSchema = z.enum([
  EventType.Heartbeat,
  EventType.FallSuspected,
  EventType.FallConfirmed,
  EventType.VoiceCheckinResult,
  EventType.ZoneEntry,
  EventType.ZoneExit,
  EventType.PersonKnown,
  EventType.PersonUnknown,
  EventType.GuardianOffline,
  EventType.VlmVerdict,
]);

/** A single pose keypoint. We reason about skeletons, not pixels. */
export const keypointSchema = z.object({
  /** Landmark name, e.g. "left_hip" (MediaPipe / MoveNet naming). */
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  /** Optional depth/z where the model provides it. */
  z: z.number().optional(),
  /** Per-keypoint detection confidence in [0, 1]. */
  confidence: z.number().min(0).max(1),
});

export type Keypoint = z.infer<typeof keypointSchema>;

/**
 * Structured, privacy-preserving payload. Free-form to allow per-event-type fields
 * (labels, confidences, zone ids, keypoints) while a strict refinement blocks any
 * attempt to smuggle raw media through the envelope.
 */
const forbiddenMediaKeys = ['image', 'frame', 'pixels', 'audio', 'photo', 'video', 'raw'];

export const eventPayloadSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (payload) => !Object.keys(payload).some((k) => forbiddenMediaKeys.includes(k.toLowerCase())),
    {
      message:
        'Event payload may not contain raw media (image/frame/pixels/audio/photo/video/raw). See CONTRIBUTING.md rule #1.',
    },
  );

export const eventEnvelopeSchema = z.object({
  /** Client-generated id so offline queue-and-replay is idempotent on the backend. */
  eventId: z.string().uuid(),
  deviceId: z.string().min(1),
  type: eventTypeSchema,
  /** When the event occurred on-device (ISO 8601, device clock). */
  occurredAt: z.string().datetime(),
  /** Model / ruleset confidence in [0, 1] where applicable. */
  confidence: z.number().min(0).max(1).optional(),
  keypoints: z.array(keypointSchema).optional(),
  payload: eventPayloadSchema.default({}),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/**
 * The payload of a `vlm.verdict` event (F3.1). When the pose pipeline flags an event,
 * a small on-device vision-language model gives a second opinion — floor or sofa? a
 * walker nearby? — carried here as labels and booleans only. The frame it looked at is
 * processed in memory on the device and discarded; nothing but this structured verdict
 * leaves (rule #1). Its confidence rides on the envelope's `confidence`.
 *
 * The deterministic engine still decides (rule #3): this is one input among the rules,
 * recorded and shown alongside the incident, never an instruction on its own.
 */
export const vlmVerdictSchema = z.object({
  /** The flagged event this is a second opinion on (its eventId). */
  aboutEventId: z.string().uuid(),
  /** Whether the VLM's look supports the flag: confirmed, refuted, or unsure. */
  verdict: z.enum(['confirmed', 'refuted', 'uncertain']),
  /** Is the person on the floor (vs a sofa/bed)? Undefined if the VLM did not judge it. */
  onFloor: z.boolean().optional(),
  /** Is a walker or mobility aid nearby? */
  walkerNearby: z.boolean().optional(),
  /** Is an exterior door open? */
  doorOpen: z.boolean().optional(),
  /** A short, non-identifying label, never a description of a person. */
  note: z.string().max(200).optional(),
});

export type VlmVerdict = z.infer<typeof vlmVerdictSchema>;

/** Parse a raw event payload as a VLM verdict, or null if it is not a well-formed one. */
export function parseVlmVerdict(payload: unknown): VlmVerdict | null {
  const result = vlmVerdictSchema.safeParse(payload);
  return result.success ? result.data : null;
}
