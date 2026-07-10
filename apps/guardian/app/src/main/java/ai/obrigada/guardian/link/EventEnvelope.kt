package ai.obrigada.guardian.link

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * The event envelope — the ONLY shape that may leave a guardian device. Mirrors
 * packages/shared/src/events/event-envelope.ts. Events carry labels, timestamps,
 * keypoints, and confidences — never pixels, never raw audio (CLAUDE.md rule #1).
 */
@Serializable
data class EventEnvelope(
    /** Client-generated id so offline queue-and-replay is idempotent on the backend. */
    val eventId: String,
    val deviceId: String,
    /** One of the shared EventType values, e.g. "fall.suspected", "fall.confirmed". */
    val type: String,
    /** When the event occurred on-device (ISO 8601, device clock). */
    val occurredAt: String,
    /** Model / ruleset confidence in [0, 1] where applicable. */
    val confidence: Float? = null,
    /** The skeleton we reasoned about — coordinates only, never a face crop. */
    val keypoints: List<Keypoint>? = null,
    /** Structured, privacy-preserving per-type fields. Never raw media. */
    val payload: JsonObject = JsonObject(emptyMap()),
)

/** A single pose keypoint. We reason about skeletons, not pixels. */
@Serializable
data class Keypoint(
    val name: String,
    val x: Float,
    val y: Float,
    val z: Float? = null,
    /** Per-keypoint detection confidence in [0, 1]. */
    val confidence: Float,
)

/** Event type strings shared with the backend. Kept in sync with the shared EventType enum. */
object EventTypes {
    const val FALL_SUSPECTED = "fall.suspected"
    const val FALL_CONFIRMED = "fall.confirmed"
    const val VOICE_CHECKIN_RESULT = "voice.checkin_result"
    const val PERSON_KNOWN = "person.known"
    const val PERSON_UNKNOWN = "person.unknown"
    const val ZONE_ENTRY = "zone.entry"
    const val ZONE_EXIT = "zone.exit"
}
