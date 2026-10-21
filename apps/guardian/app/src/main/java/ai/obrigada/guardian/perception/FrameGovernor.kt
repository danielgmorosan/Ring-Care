package ai.obrigada.guardian.perception

/**
 * Adaptive frame-rate policy (CONTRIBUTING.md: "every on-device model needs a CPU fallback path
 * and adaptive frame rates"). The guardian runs on old donated phones with weak thermals, so
 * perception must ease off as the phone heats up or the battery drains — but it is a safety
 * device, so it never stops. This returns the minimum gap between processed frames; the
 * analyzer skips frames that arrive sooner.
 *
 * Pure so the policy is unit-tested. Thermal levels are Android's PowerManager.THERMAL_STATUS_*
 * (0 = none … 6 = shutdown); battery is a percentage, or -1 when unknown (treated as fine).
 */
object FrameGovernor {

    /** Cool and charged: ~6 fps is already ample for a fall that unfolds over seconds. */
    const val BASELINE_MS = 150L

    /** Never let the gap grow past this: even under extreme stress we still look every 3s. */
    const val MAX_MS = 3000L

    // Android PowerManager.THERMAL_STATUS_* values we branch on.
    private const val LIGHT = 1
    private const val MODERATE = 2
    private const val SEVERE = 3

    fun poseIntervalMs(thermalStatus: Int, batteryPct: Int): Long {
        val thermalMs =
            when {
                thermalStatus <= 0 -> BASELINE_MS // NONE
                thermalStatus == LIGHT -> 250L
                thermalStatus == MODERATE -> 500L
                thermalStatus == SEVERE -> 1000L
                else -> 2000L // CRITICAL / EMERGENCY / SHUTDOWN — slow, never off
            }
        // Ease off further on a low battery so a donated phone lasts. Unknown (-1) counts as fine.
        val batteryPenalty =
            when (batteryPct) {
                in 0..9 -> 1000L
                in 10..19 -> 500L
                else -> 0L
            }
        return (thermalMs + batteryPenalty).coerceIn(BASELINE_MS, MAX_MS)
    }
}
