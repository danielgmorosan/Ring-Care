package ai.obrigada.guardian.perception

import kotlin.math.sqrt

/** An enrolled household member: a local id, a name for the caregiver, and the face vector. */
data class EnrolledFace(
    val id: String,
    val name: String,
    val embedding: FloatArray,
) {
    // Arrays need explicit equals/hashCode for value semantics.
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is EnrolledFace) return false
        return id == other.id && name == other.name && embedding.contentEquals(other.embedding)
    }

    override fun hashCode(): Int =
        (id.hashCode() * 31 + name.hashCode()) * 31 + embedding.contentHashCode()
}

/** The best enrolled match for a probe face, above the recognition threshold. */
data class FaceMatch(val id: String, val name: String, val similarity: Float)

/**
 * Pure face matching (F2.2). Compares a probe embedding to the enrolled household by cosine
 * similarity and returns the best match above a threshold, or null (a stranger). No IO, no
 * model — so the decision boundary is unit-tested. Recognition itself runs on-device and the
 * embeddings never leave the phone (CONTRIBUTING.md rule #4).
 */
object FaceMatcher {

    /** Default cosine-similarity threshold. Tuned per model against enrolled faces. */
    const val DEFAULT_THRESHOLD = 0.55f

    fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        if (a.isEmpty() || a.size != b.size) return 0f
        var dot = 0f
        var normA = 0f
        var normB = 0f
        for (i in a.indices) {
            dot += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }
        val denom = sqrt(normA) * sqrt(normB)
        return if (denom == 0f) 0f else dot / denom
    }

    /**
     * The best enrolled match above [threshold], or null if the closest is still too far
     * (a stranger). Ties resolve to the highest similarity.
     */
    fun bestMatch(
        probe: FloatArray,
        enrolled: List<EnrolledFace>,
        threshold: Float = DEFAULT_THRESHOLD,
    ): FaceMatch? {
        var best: FaceMatch? = null
        for (face in enrolled) {
            val similarity = cosineSimilarity(probe, face.embedding)
            if (similarity >= threshold && (best == null || similarity > best.similarity)) {
                best = FaceMatch(face.id, face.name, similarity)
            }
        }
        return best
    }
}
