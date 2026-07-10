package ai.obrigada.guardian.perception

/**
 * A single normalized pose landmark. x/y are in [0, 1] relative to the image (y down);
 * visibility is the model's confidence that the point is present and unoccluded.
 */
data class PosePoint(
    val x: Float,
    val y: Float,
    val z: Float,
    val visibility: Float,
)

/** One frame's worth of pose: the landmarks we kept, keyed by name, at a device timestamp. */
data class PoseFrame(
    val timestampMs: Long,
    val points: Map<String, PosePoint>,
) {
    fun point(name: String): PosePoint? = points[name]
}

/**
 * MediaPipe BlazePose 33-landmark names by index. We keep the body landmarks and drop the
 * head/face points (eyes, ears, mouth): the fall heuristic reasons about the torso and
 * limbs, and shipping fewer face-adjacent points keeps events firmly skeletal.
 */
object Landmarks {
    const val LEFT_SHOULDER = "left_shoulder"
    const val RIGHT_SHOULDER = "right_shoulder"
    const val LEFT_HIP = "left_hip"
    const val RIGHT_HIP = "right_hip"
    const val LEFT_ANKLE = "left_ankle"
    const val RIGHT_ANKLE = "right_ankle"

    /** index -> name for the body landmarks we emit; head/face indices (0..10) are omitted. */
    val BY_INDEX: Map<Int, String> =
        mapOf(
            11 to LEFT_SHOULDER,
            12 to RIGHT_SHOULDER,
            13 to "left_elbow",
            14 to "right_elbow",
            15 to "left_wrist",
            16 to "right_wrist",
            23 to LEFT_HIP,
            24 to RIGHT_HIP,
            25 to "left_knee",
            26 to "right_knee",
            27 to "left_ankle",
            28 to "right_ankle",
        )
}
