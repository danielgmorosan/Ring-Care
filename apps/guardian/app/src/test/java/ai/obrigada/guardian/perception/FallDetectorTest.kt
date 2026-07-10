package ai.obrigada.guardian.perception

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The fall heuristic is the on-device half of the deterministic safety core (rule #3), so
 * its behavior is pinned by tests: a genuine fall escalates suspected -> confirmed, and the
 * everyday postures that look a little like a fall (standing, sitting, occlusion) do not.
 */
class FallDetectorTest {

    /** Shoulders directly above hips, body high in frame — a standing person. */
    private fun standing(t: Long) = frame(t, sx = 0.5f, sy = 0.30f, hx = 0.5f, hy = 0.58f)

    /** Torso horizontal and low in frame — a person on the floor. */
    private fun onFloor(t: Long) = frame(t, sx = 0.30f, sy = 0.80f, hx = 0.72f, hy = 0.82f)

    private fun frame(t: Long, sx: Float, sy: Float, hx: Float, hy: Float, vis: Float = 0.9f) =
        PoseFrame(
            timestampMs = t,
            points =
                mapOf(
                    Landmarks.LEFT_SHOULDER to PosePoint(sx, sy, 0f, vis),
                    Landmarks.RIGHT_SHOULDER to PosePoint(sx, sy, 0f, vis),
                    Landmarks.LEFT_HIP to PosePoint(hx, hy, 0f, vis),
                    Landmarks.RIGHT_HIP to PosePoint(hx, hy, 0f, vis),
                ),
        )

    @Test
    fun `a standing person never triggers`() {
        val detector = FallDetector()
        for (t in 0..20_000L step 500) {
            assertNull("standing should not signal at $t", detector.update(standing(t)))
        }
    }

    @Test
    fun `a sustained fall goes suspected then confirmed`() {
        val detector = FallDetector()
        assertNull(detector.update(standing(0)))

        // Person goes down at t=1000. Nothing yet — the heuristic waits out a brief window.
        assertNull(detector.update(onFloor(1_000)))
        assertNull(detector.update(onFloor(2_000)))

        // Past the suspect window (1.5s down): suspected.
        val suspected = detector.update(onFloor(3_000))
        assertTrue("expected Suspected, got $suspected", suspected is FallSignal.Suspected)

        // Still down between suspect and confirm windows: no new signal.
        assertNull(detector.update(onFloor(5_000)))

        // Past the confirm window (8s down): confirmed, exactly once.
        val confirmed = detector.update(onFloor(9_500))
        assertTrue("expected Confirmed, got $confirmed", confirmed is FallSignal.Confirmed)
        assertNull(detector.update(onFloor(12_000)))
    }

    @Test
    fun `standing back up before the confirm window cancels the fall`() {
        val detector = FallDetector()
        detector.update(standing(0))
        detector.update(onFloor(1_000))
        val suspected = detector.update(onFloor(3_000))
        assertTrue(suspected is FallSignal.Suspected)

        // Gets back up — the fall is cleared, no confirmation follows.
        assertNull(detector.update(standing(4_000)))
        assertNull(detector.update(standing(12_000)))

        // A fresh fall later is detected again from scratch.
        detector.update(onFloor(13_000))
        val again = detector.update(onFloor(15_000))
        assertTrue("a later fall should re-trigger, got $again", again is FallSignal.Suspected)
    }

    @Test
    fun `low landmark visibility yields no judgment`() {
        val detector = FallDetector()
        // Horizontal and low, but the model is unsure the points are real: hold, do not fire.
        val signal = detector.update(frame(3_000, 0.3f, 0.8f, 0.72f, 0.82f, vis = 0.2f))
        assertNull(signal)
    }

    @Test
    fun `confidence is reported in unit range`() {
        val detector = FallDetector()
        detector.update(onFloor(0))
        val signal = detector.update(onFloor(2_000))
        assertTrue(signal is FallSignal.Suspected)
        val c = (signal as FallSignal.Suspected).confidence
        assertEquals(true, c in 0f..1f)
    }
}
