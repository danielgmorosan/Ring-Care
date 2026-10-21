package ai.obrigada.guardian.perception

import ai.obrigada.guardian.link.EventEnvelope
import ai.obrigada.guardian.link.EventTypes
import ai.obrigada.guardian.link.Keypoint
import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.util.UUID

/**
 * The camera-side perception (F1.2). A CameraX analyzer that runs MediaPipe Pose on each
 * frame, extracts the skeleton, and feeds it to the deterministic [FallDetector]. On a
 * transition it emits a fall.suspected / fall.confirmed event to the [PerceptionBus] — the
 * frame itself is processed in memory and never leaves (CONTRIBUTING.md rule #1).
 *
 * If the pose model asset is missing (app/src/main/assets/pose_landmarker_lite.task), the
 * analyzer logs once and becomes a no-op so the camera preview still runs. Drop the model
 * in to enable detection — see the README.
 */
class PoseAnalyzer(
    context: Context,
    private val deviceId: String,
    private val onEvent: (EventEnvelope) -> Unit = PerceptionBus::emit,
    /** Optional face recognition fed the same upright frames (it throttles itself). */
    private val faceRecognizer: FaceRecognizer? = null,
    /** Optional zone watching, fed the person's ground position from each pose. */
    private val zoneWatcher: ZoneWatcher? = null,
) : ImageAnalysis.Analyzer {

    private val detector = FallDetector()
    private val conditions = DeviceConditions(context)
    private var lastTimestampMs = 0L
    private var lastProcessMs = 0L

    private val landmarker: PoseLandmarker? =
        try {
            val base = BaseOptions.builder().setModelAssetPath(MODEL_ASSET).build()
            val options =
                PoseLandmarker.PoseLandmarkerOptions.builder()
                    .setBaseOptions(base)
                    .setRunningMode(RunningMode.LIVE_STREAM)
                    .setNumPoses(1)
                    .setMinPoseDetectionConfidence(0.5f)
                    .setMinTrackingConfidence(0.5f)
                    .setMinPosePresenceConfidence(0.5f)
                    .setResultListener { result, _ -> onResult(result) }
                    .setErrorListener { e -> Log.e(TAG, "pose error: ${e.message}") }
                    .build()
            PoseLandmarker.createFromOptions(context, options)
        } catch (e: Exception) {
            Log.w(TAG, "pose model unavailable ($MODEL_ASSET); detection disabled: ${e.message}")
            null
        }

    override fun analyze(image: ImageProxy) {
        val poseLandmarker = landmarker
        if (poseLandmarker == null) {
            image.close()
            return
        }
        // Adaptive frame rate: skip this frame if we processed one within the governed gap.
        // The gap widens as the phone heats up or the battery drains, but never past the
        // safety ceiling, so a weak donated phone is not cooked yet a fall is still seen.
        val now = SystemClock.uptimeMillis()
        if (now - lastProcessMs < conditions.currentIntervalMs()) {
            image.close()
            return
        }
        lastProcessMs = now
        try {
            val bitmap = image.toUprightBitmap()
            val mpImage = BitmapImageBuilder(bitmap).build()
            // MediaPipe LIVE_STREAM needs strictly increasing timestamps (ms).
            val ts = maxOf(SystemClock.uptimeMillis(), lastTimestampMs + 1)
            lastTimestampMs = ts
            // The bitmap is already rotated upright, so no rotation in ImageProcessingOptions.
            poseLandmarker.detectAsync(mpImage, ImageProcessingOptions.builder().build(), ts)
            // Face recognition shares the same upright frame; it throttles its own model runs.
            faceRecognizer?.onFrame(bitmap, ts)
        } catch (e: Exception) {
            Log.w(TAG, "analyze failed: ${e.message}")
        } finally {
            image.close()
        }
    }

    private fun onResult(result: PoseLandmarkerResult) {
        val poses = result.landmarks()
        if (poses.isEmpty()) return
        val landmarks = poses[0]

        val points = HashMap<String, PosePoint>()
        Landmarks.BY_INDEX.forEach { (index, name) ->
            landmarks.getOrNull(index)?.let { lm ->
                points[name] =
                    PosePoint(
                        x = lm.x(),
                        y = lm.y(),
                        z = lm.z(),
                        visibility = lm.visibility().orElse(0f),
                    )
            }
        }
        if (points.isEmpty()) return

        val frame = PoseFrame(timestampMs = result.timestampMs(), points = points)

        // Zone geometry runs whenever the person is visible, not only on a fall.
        groundPoint(points)?.let { (x, y) -> zoneWatcher?.update(x, y) }

        val signal = detector.update(frame) ?: return
        onEvent(buildEvent(signal, points))
    }

    /**
     * Where the person is standing, for zone geometry: the feet if we can see them, else the
     * hips. Returns a normalized point, or null if the lower body is not visible enough.
     */
    private fun groundPoint(points: Map<String, PosePoint>): Pair<Float, Float>? {
        val la = points[Landmarks.LEFT_ANKLE]
        val ra = points[Landmarks.RIGHT_ANKLE]
        if (la != null && ra != null && la.visibility > 0.5f && ra.visibility > 0.5f) {
            return (la.x + ra.x) / 2f to (la.y + ra.y) / 2f
        }
        val lh = points[Landmarks.LEFT_HIP]
        val rh = points[Landmarks.RIGHT_HIP]
        if (lh != null && rh != null && lh.visibility > 0.5f && rh.visibility > 0.5f) {
            return (lh.x + rh.x) / 2f to (lh.y + rh.y) / 2f
        }
        return null
    }

    private fun buildEvent(signal: FallSignal, points: Map<String, PosePoint>): EventEnvelope {
        val type =
            when (signal) {
                is FallSignal.Suspected -> EventTypes.FALL_SUSPECTED
                is FallSignal.Confirmed -> EventTypes.FALL_CONFIRMED
            }
        val downMs =
            when (signal) {
                is FallSignal.Suspected -> signal.downMs
                is FallSignal.Confirmed -> signal.downMs
            }
        val keypoints =
            points.map { (name, p) ->
                Keypoint(name = name, x = p.x, y = p.y, z = p.z, confidence = p.visibility)
            }
        val payload: JsonObject =
            buildJsonObject {
                put("detector", "pose-heuristic-v1")
                put("downMs", downMs)
            }
        return EventEnvelope(
            eventId = UUID.randomUUID().toString(),
            deviceId = deviceId,
            type = type,
            occurredAt = Instant.now().toString(),
            confidence = signal.confidence,
            keypoints = keypoints,
            payload = payload,
        )
    }

    /** Convert an RGBA_8888 ImageProxy to an upright ARGB_8888 bitmap (handles row padding). */
    private fun ImageProxy.toUprightBitmap(): Bitmap {
        val plane = planes[0]
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * width
        val paddedWidth = width + rowPadding / pixelStride

        val padded = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
        padded.copyPixelsFromBuffer(plane.buffer)
        val cropped =
            if (paddedWidth != width) Bitmap.createBitmap(padded, 0, 0, width, height) else padded

        val rotation = imageInfo.rotationDegrees
        if (rotation == 0) return cropped
        val matrix = android.graphics.Matrix().apply { postRotate(rotation.toFloat()) }
        return Bitmap.createBitmap(cropped, 0, 0, cropped.width, cropped.height, matrix, true)
    }

    fun close() {
        landmarker?.close()
    }

    private companion object {
        const val TAG = "PoseAnalyzer"
        const val MODEL_ASSET = "pose_landmarker_lite.task"
    }
}
