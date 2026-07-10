package ai.obrigada.guardian.perception

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The matcher draws the household-member / stranger line, so its boundary is pinned: a close
 * vector matches the right person, a distant one is a stranger, and the nearest enrolled face
 * wins. Getting this wrong either lets a stranger pass or flags the elder as an intruder.
 */
class FaceMatcherTest {

    private fun enrolled() =
        listOf(
            EnrolledFace("1", "Mum", floatArrayOf(1f, 0f, 0f, 0f)),
            EnrolledFace("2", "Daughter", floatArrayOf(0f, 1f, 0f, 0f)),
        )

    @Test
    fun `cosine similarity is 1 for identical direction and 0 for orthogonal`() {
        assertEquals(1f, FaceMatcher.cosineSimilarity(floatArrayOf(2f, 0f), floatArrayOf(5f, 0f)), 1e-4f)
        assertEquals(0f, FaceMatcher.cosineSimilarity(floatArrayOf(1f, 0f), floatArrayOf(0f, 1f)), 1e-4f)
    }

    @Test
    fun `a near-identical probe matches the right person`() {
        val probe = floatArrayOf(0.98f, 0.05f, 0f, 0f)
        val match = FaceMatcher.bestMatch(probe, enrolled())
        assertEquals("Mum", match?.name)
    }

    @Test
    fun `a distant probe is a stranger (no match)`() {
        val probe = floatArrayOf(0f, 0f, 1f, 0f) // orthogonal to everyone enrolled
        assertNull(FaceMatcher.bestMatch(probe, enrolled()))
    }

    @Test
    fun `the closest enrolled face wins when several are above threshold`() {
        val a = EnrolledFace("a", "A", floatArrayOf(1f, 0f))
        val b = EnrolledFace("b", "B", floatArrayOf(0.9f, 0.1f))
        val probe = floatArrayOf(0.95f, 0.05f)
        val match = FaceMatcher.bestMatch(probe, listOf(a, b), threshold = 0.5f)
        assertEquals("A", match?.name)
    }

    @Test
    fun `no one enrolled means no match`() {
        assertNull(FaceMatcher.bestMatch(floatArrayOf(1f, 0f), emptyList()))
    }

    @Test
    fun `mismatched vector lengths never match`() {
        val match = FaceMatcher.bestMatch(floatArrayOf(1f, 0f, 0f), enrolled())
        // enrolled vectors are length 4; a length-3 probe cannot match.
        assertTrue(match == null)
    }
}
