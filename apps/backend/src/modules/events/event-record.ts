import type { EventEnvelope, Keypoint } from '@obrigada/shared';

/**
 * A row destined for the append-only event_stream. Derived from the device's
 * EventEnvelope — labels, timestamps, keypoints, confidences only (rule #1).
 */
export interface EventRecord {
  occurredAt: string;
  eventId: string;
  deviceId: string;
  type: string;
  confidence: number | null;
  keypoints: Keypoint[] | null;
  payload: Record<string, unknown>;
}

export function toEventRecord(envelope: EventEnvelope): EventRecord {
  return {
    occurredAt: envelope.occurredAt,
    eventId: envelope.eventId,
    deviceId: envelope.deviceId,
    type: envelope.type,
    confidence: envelope.confidence ?? null,
    keypoints: envelope.keypoints ?? null,
    payload: envelope.payload,
  };
}
