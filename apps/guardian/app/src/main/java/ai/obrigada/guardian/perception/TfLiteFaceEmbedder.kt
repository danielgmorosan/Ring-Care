package ai.obrigada.guardian.perception

import android.content.Context
import android.graphics.Bitmap
import android.graphics.RectF
import android.util.Log
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import kotlin.math.sqrt

/**
 * Face embedding via a raw TFLite interpreter (F2.2). Runs any MobileFaceNet-family model —
 * no MediaPipe metadata required — so a founder-vetted face model drops straight in as
 * app/src/main/assets/mobile_face_net.tflite. Input/output tensor shapes are read from the
 * model, so 112x112 vs other sizes and 128- vs 192-d embeddings both work.
 *
 * If the model asset is absent (or fails to load) the embedder is unavailable and recognition
 * stays disabled — the rest of the guardian runs regardless. The face crop is processed in
 * memory and discarded; only the resulting vector is ever kept, on-device (rule #4).
 */
class TfLiteFaceEmbedder(context: Context, modelAsset: String = MODEL_ASSET) {

    private val interpreter: Interpreter? =
        try {
            Interpreter(loadModel(context, modelAsset))
        } catch (e: Exception) {
            Log.w(TAG, "face embedder model unavailable ($modelAsset); recognition disabled: ${e.message}")
            null
        }

    private val inputBatch: Int
    private val inputWidth: Int
    private val inputHeight: Int
    private val outputSize: Int

    init {
        val inputShape = interpreter?.getInputTensor(0)?.shape() // [N, H, W, 3]
        inputBatch = (inputShape?.getOrNull(0) ?: 1).coerceAtLeast(1)
        inputHeight = inputShape?.getOrNull(1) ?: 112
        inputWidth = inputShape?.getOrNull(2) ?: 112
        outputSize = interpreter?.getOutputTensor(0)?.shape()?.getOrNull(1) ?: 0
    }

    val isAvailable: Boolean
        get() = interpreter != null && outputSize > 0

    /** Embed the face inside [box] (pixel coords in [bitmap]); returns an L2-normalized vector. */
    fun embed(bitmap: Bitmap, box: RectF): FloatArray? {
        val itp = interpreter ?: return null
        val face = cropFace(bitmap, box) ?: return null
        val scaled = Bitmap.createScaledBitmap(face, inputWidth, inputHeight, true)
        // Some models (e.g. InsightFace pair comparators) fix the batch at 2; fill the batch
        // with the same face and read row 0. Batch 1 is the common case.
        val output = Array(inputBatch) { FloatArray(outputSize) }
        return try {
            itp.run(toInputBuffer(scaled), output)
            l2Normalize(output[0])
        } catch (e: Exception) {
            Log.w(TAG, "embed failed: ${e.message}")
            null
        }
    }

    fun close() {
        interpreter?.close()
    }

    private fun cropFace(bitmap: Bitmap, box: RectF): Bitmap? {
        val left = box.left.toInt().coerceIn(0, bitmap.width - 1)
        val top = box.top.toInt().coerceIn(0, bitmap.height - 1)
        val right = box.right.toInt().coerceIn(left + 1, bitmap.width)
        val bottom = box.bottom.toInt().coerceIn(top + 1, bitmap.height)
        val w = right - left
        val h = bottom - top
        if (w <= 0 || h <= 0) return null
        return Bitmap.createBitmap(bitmap, left, top, w, h)
    }

    private fun toInputBuffer(bitmap: Bitmap): ByteBuffer {
        val buffer =
            ByteBuffer.allocateDirect(4 * inputBatch * inputWidth * inputHeight * 3)
                .order(ByteOrder.nativeOrder())
        val pixels = IntArray(inputWidth * inputHeight)
        bitmap.getPixels(pixels, 0, inputWidth, 0, 0, inputWidth, inputHeight)
        // Write the same face into every batch slot (batch is 1 for most models).
        repeat(inputBatch) {
            for (pixel in pixels) {
                val r = (pixel shr 16) and 0xFF
                val g = (pixel shr 8) and 0xFF
                val b = pixel and 0xFF
                // MobileFaceNet normalization: (px - 127.5) / 128, into [-1, 1).
                buffer.putFloat((r - 127.5f) / 128f)
                buffer.putFloat((g - 127.5f) / 128f)
                buffer.putFloat((b - 127.5f) / 128f)
            }
        }
        buffer.rewind()
        return buffer
    }

    private fun l2Normalize(vector: FloatArray): FloatArray {
        var norm = 0f
        for (value in vector) norm += value * value
        norm = sqrt(norm)
        if (norm == 0f) return vector
        return FloatArray(vector.size) { vector[it] / norm }
    }

    private fun loadModel(context: Context, asset: String): ByteBuffer {
        // The .tflite asset is stored uncompressed (noCompress "tflite"), so it can be mapped.
        context.assets.openFd(asset).use { fd ->
            FileInputStream(fd.fileDescriptor).use { input ->
                return input.channel.map(
                    FileChannel.MapMode.READ_ONLY,
                    fd.startOffset,
                    fd.declaredLength,
                )
            }
        }
    }

    private companion object {
        const val MODEL_ASSET = "mobile_face_net.tflite"
        const val TAG = "TfLiteFaceEmbedder"
    }
}
