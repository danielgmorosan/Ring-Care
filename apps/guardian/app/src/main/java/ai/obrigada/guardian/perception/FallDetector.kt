package ai.obrigada.guardian.perception

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.min

/** What the detector concluded on a given frame. Null between transitions. */
sealed interface FallSignal {
    val confidence: Float

    /** The person looks horizontal and low, and has stayed that way briefly. */
    data class Suspected(override val confidence: Float, val downMs: Long) : FallSignal

    /** Still down well past the check-in window — a fall we are confident about. */
    data class Confirmed(override val confidence: Float, val downMs: Long) : FallSignal
}

/**
 * Deterministic, rules-based fall detection (F1.2). Pure and stateful: feed it pose
 * frames in order and it emits at most one signal per transition. This is the on-device
 * half of the deterministic safety core (CONTRIBUTING.md rule #3) — it never calls anyone; it
 * emits fall.suspected / fall.confirmed events, and the backend's Temporal state machine
 * decides escalation. A later on-device VLM is only a second opinion, never authority.
 *
 * The heuristic: a person is "down" when the torso is far from vertical AND the body sits
 * low in the frame, with the torso landmarks visible. Sustained briefly -> suspected;
 * sustained past the check-in window -> confirmed. Standing back up resets it. Thresholds
 * are a first pass, to be tuned against real falls (the on-device testing you'll do).
 */
class FallDetector(
    private val suspectAfterMs: Long = 1_500,
    private val confirmAfterMs: Long = 8_000,
    private val horizontalAngleDeg: Float = 55f,
    private val lowBodyThreshold: Float = 0.60f,
    private val uprightAngleDeg: Float = 35f,
    private val minVisibility: Float = 0.5f,
) {
    private enum class Phase { Upright, Suspected, Confirmed }

    private var phase = Phase.Upright
    private var downSinceMs: Long? = null

    /** Feed one frame; returns a signal only on a state transition, else null. */
    fun update(frame: PoseFrame): FallSignal? {
        val posture = posture(frame) ?: return null // torso not visible enough to judge

        if (posture.isDownward) {
            val since = downSinceMs ?: frame.timestampMs.also { downSinceMs = it }
            val downMs = frame.timestampMs - since

            if (phase == Phase.Upright && downMs >= suspectAfterMs) {
                phase = Phase.Suspected
                return FallSignal.Suspected(posture.confidence, downMs)
            }
            if (phase == Phase.Suspected && downMs >= confirmAfterMs) {
                phase = Phase.Confirmed
                return FallSignal.Confirmed(posture.confidence, downMs)
            }
            return null
        }

        // Clearly upright again: reset so a later fall is detected afresh.
        if (posture.isUpright) {
            phase = Phase.Upright
            downSinceMs = null
        }
        // Otherwise ambiguous (sitting, bending, partly occluded): hold state, emit nothing.
        return null
    }

    private data class Posture(
        val isDownward: Boolean,
        val isUpright: Boolean,
        val confidence: Float,
    )

    private fun posture(frame: PoseFrame): Posture? {
        val ls = frame.point(Landmarks.LEFT_SHOULDER)
        val rs = frame.point(Landmarks.RIGHT_SHOULDER)
        val lh = frame.point(Landmarks.LEFT_HIP)
        val rh = frame.point(Landmarks.RIGHT_HIP)
        if (ls == null || rs == null || lh == null || rh == null) return null

        val visibility = min(min(ls.visibility, rs.visibility), min(lh.visibility, rh.visibility))
        if (visibility < minVisibility) return null

        val shoulderX = (ls.x + rs.x) / 2f
        val shoulderY = (ls.y + rs.y) / 2f
        val hipX = (lh.x + rh.x) / 2f
        val hipY = (lh.y + rh.y) / 2f

        // Angle of the torso (shoulders->hips) from vertical: ~0deg standing, ~90deg lying.
        val dx = hipX - shoulderX
        val dy = hipY - shoulderY
        val angleDeg = Math.toDegrees(atan2(abs(dx).toDouble(), abs(dy).toDouble())).toFloat()
        val bodyCenterY = (shoulderY + hipY) / 2f

        val isDownward = angleDeg >= horizontalAngleDeg && bodyCenterY >= lowBodyThreshold
        val isUpright = angleDeg <= uprightAngleDeg && bodyCenterY < lowBodyThreshold

        // Confidence blends how horizontal the torso is with how visible the landmarks are.
        val horizontalness = (angleDeg / 90f).coerceIn(0f, 1f)
        val confidence = (0.5f * horizontalness + 0.5f * visibility).coerceIn(0f, 1f)

        return Posture(isDownward = isDownward, isUpright = isUpright, confidence = confidence)
    }
}
