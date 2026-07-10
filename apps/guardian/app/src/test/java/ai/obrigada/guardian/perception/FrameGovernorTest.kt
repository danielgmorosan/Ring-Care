package ai.obrigada.guardian.perception

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The frame governor is what keeps the guardian from cooking a weak donated phone, so its
 * policy is pinned: it slows down as the phone heats up or the battery drains, never speeds
 * past the baseline, and — because it is a safety device — never stalls past the 3s ceiling.
 */
class FrameGovernorTest {

    @Test
    fun `cool and charged runs at the baseline`() {
        assertEquals(FrameGovernor.BASELINE_MS, FrameGovernor.poseIntervalMs(0, 90))
        // Unknown battery is treated as fine.
        assertEquals(FrameGovernor.BASELINE_MS, FrameGovernor.poseIntervalMs(0, -1))
    }

    @Test
    fun `hotter means a longer gap (monotonic)`() {
        val none = FrameGovernor.poseIntervalMs(0, 90)
        val light = FrameGovernor.poseIntervalMs(1, 90)
        val moderate = FrameGovernor.poseIntervalMs(2, 90)
        val severe = FrameGovernor.poseIntervalMs(3, 90)
        val critical = FrameGovernor.poseIntervalMs(4, 90)
        assertTrue(none < light)
        assertTrue(light < moderate)
        assertTrue(moderate < severe)
        assertTrue(severe < critical)
    }

    @Test
    fun `a low battery eases off further`() {
        val ok = FrameGovernor.poseIntervalMs(2, 80)
        val low = FrameGovernor.poseIntervalMs(2, 15)
        val critical = FrameGovernor.poseIntervalMs(2, 5)
        assertTrue(low > ok)
        assertTrue(critical > low)
    }

    @Test
    fun `it never stalls past the safety ceiling`() {
        // Worst case: shutdown-level thermal and a dead battery.
        assertEquals(FrameGovernor.MAX_MS, FrameGovernor.poseIntervalMs(6, 1))
        assertTrue(FrameGovernor.poseIntervalMs(6, 1) <= FrameGovernor.MAX_MS)
    }

    @Test
    fun `it never drops below the baseline`() {
        assertTrue(FrameGovernor.poseIntervalMs(0, 100) >= FrameGovernor.BASELINE_MS)
    }
}
