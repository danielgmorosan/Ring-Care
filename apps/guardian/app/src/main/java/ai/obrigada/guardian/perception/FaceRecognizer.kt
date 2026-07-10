package ai.obrigada.guardian.perception

import ai.obrigada.guardian.link.EventEnvelope
import ai.obrigada.guardian.link.EventTypes
import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facedetector.FaceDetector
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.util.UUID

/**
 * On-device face recognition (F2.2/F2.4). For each (throttled) frame it detects the largest
 * face (MediaPipe FaceDetector), embeds it (a MobileFaceNet-family TFLite model), and matches
 * against the enrolled household: a match emits person.known, a miss emits person.unknown
 * (which the backend's stranger evaluator turns into an alert). The frame is processed in
 * memory and discarded; only the labelled event leaves (rule #1), and the face vectors live
 * only on the phone (rule #4).
 *
 * Both models are optional assets (app/src/main/assets). If either is missing the recognizer
 * is a no-op, so the rest of the guardian still runs. Until at least one household member is
 * enrolled it stays silent — it must never flag the elder as a stranger in an empty household.
 */
class FaceRecognizer(
    context: Context,
    private val deviceId: String,
    private val faceStore: FaceStore,
    private val onEvent: (EventEnvelope) -> Unit = PerceptionBus::emit,
) {
    private val main = Handler(Looper.getMainLooper())
    private var lastProcessMs = 0L
    private var lastEmitMs = 0L

    @Volatile private var enrollName: String? = null
    @Volatile private var enrollCallback: ((Boolean) -> Unit)? = null

    private val detector: FaceDetector? =
        try {
            FaceDetector.createFromOptions(
                context,
                FaceDetector.FaceDetectorOptions.builder()
                    .setBaseOptions(BaseOptions.builder().setModelAssetPath(MODEL_DETECTOR).build())
                    .setRunningMode(RunningMode.IMAGE)
                    .setMinDetectionConfidence(0.5f)
                    .build(),
            )
        } catch (e: Exception) {
            Log.w(TAG, "face detector unavailable ($MODEL_DETECTOR); recognition disabled")
            null
        }

    // A MobileFaceNet-family model via raw TFLite — any founder-vetted face model drops in.
    private val embedder = TfLiteFaceEmbedder(context)

    val isAvailable: Boolean
        get() = detector != null && embedder.isAvailable

    /** Capture the next clearly-seen face and enroll it under [name]. onDone runs on main. */
    fun startEnrollment(name: String, onDone: (Boolean) -> Unit) {
        enrollName = name
        enrollCallback = onDone
    }

    /**
     * Process one upright frame (called by the analyzer, throttled). Runs synchronously on the
     * analysis thread; MediaPipe here is IMAGE mode so nothing outlives this call.
     */
    fun onFrame(bitmap: Bitmap, timestampMs: Long) {
        val faceDetector = detector ?: return
        if (!embedder.isAvailable) return
        val enrolling = enrollName != null
        if (!enrolling) {
            // Nobody enrolled yet: stay silent so the elder is never flagged a "stranger".
            if (faceStore.count() == 0) return
            // Run the models at a modest cadence; per-frame face recognition would cook the phone.
            if (timestampMs - lastProcessMs < PROCESS_INTERVAL_MS) return
        }
        lastProcessMs = timestampMs

        val mpImage = BitmapImageBuilder(bitmap).build()
        val faces = faceDetector.detect(mpImage).detections()
        if (faces.isEmpty()) {
            if (enrolling) finishEnrollment(false)
            return
        }
        val largest =
            faces.maxByOrNull { it.boundingBox().width() * it.boundingBox().height() } ?: return

        // Embed the detected face region (pixel coords) with the TFLite model.
        val embedding = embedder.embed(bitmap, largest.boundingBox())
        if (embedding == null) {
            if (enrolling) finishEnrollment(false)
            return
        }

        if (enrolling) {
            val name = enrollName ?: return
            faceStore.add(name, embedding)
            Log.i(TAG, "enrolled a household member ($name)")
            finishEnrollment(true)
            return
        }
        recognize(embedding, timestampMs)
    }

    private fun recognize(embedding: FloatArray, timestampMs: Long) {
        // Throttle so a person lingering in view does not flood the stream with sightings.
        if (timestampMs - lastEmitMs < EMIT_INTERVAL_MS) return
        lastEmitMs = timestampMs
        val match = FaceMatcher.bestMatch(embedding, faceStore.list())
        onEvent(if (match != null) knownEvent(match) else unknownEvent())
    }

    private fun knownEvent(match: FaceMatch): EventEnvelope =
        EventEnvelope(
            eventId = UUID.randomUUID().toString(),
            deviceId = deviceId,
            type = EventTypes.PERSON_KNOWN,
            occurredAt = Instant.now().toString(),
            confidence = match.similarity,
            // A known household member: the match id stays on-device; no name leaves (rule #1).
            payload = buildJsonObject { put("match", true) },
        )

    private fun unknownEvent(): EventEnvelope =
        EventEnvelope(
            eventId = UUID.randomUUID().toString(),
            deviceId = deviceId,
            type = EventTypes.PERSON_UNKNOWN,
            occurredAt = Instant.now().toString(),
            // Uniform detection is a later VLM feature; a uniform is context, never trust (rule #5).
            payload = buildJsonObject { put("uniformed", false) },
        )

    private fun finishEnrollment(success: Boolean) {
        val callback = enrollCallback
        enrollName = null
        enrollCallback = null
        if (callback != null) main.post { callback(success) }
    }

    fun close() {
        try {
            detector?.close()
            embedder.close()
        } catch (e: Exception) {
            Log.w(TAG, "close failed: ${e.message}")
        }
    }

    private companion object {
        const val TAG = "FaceRecognizer"
        const val MODEL_DETECTOR = "blaze_face_short_range.tflite"
        const val PROCESS_INTERVAL_MS = 2_000L
        const val EMIT_INTERVAL_MS = 10_000L
    }
}
