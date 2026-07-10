package ai.obrigada.guardian.perception

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock

/**
 * Reads the phone's thermal status and battery level and turns them into the current
 * processing interval via [FrameGovernor]. Values are cached briefly so we don't poll the OS
 * every camera frame. Impure (reads system services); the policy it feeds is pure and tested.
 */
class DeviceConditions(context: Context) {

    private val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    private val battery = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager

    private var cachedAtMs = 0L
    private var thermalStatus = 0
    private var batteryPct = -1

    /** The minimum gap (ms) between processed frames right now. */
    fun currentIntervalMs(): Long {
        refreshIfStale()
        return FrameGovernor.poseIntervalMs(thermalStatus, batteryPct)
    }

    private fun refreshIfStale() {
        val now = SystemClock.uptimeMillis()
        if (now - cachedAtMs < CACHE_MS && cachedAtMs != 0L) return
        cachedAtMs = now
        // Thermal status is API 29+; older phones report NONE and lean on the battery signal.
        thermalStatus =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                power?.currentThermalStatus ?: 0
            } else {
                0
            }
        batteryPct =
            battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 }
                ?: -1
    }

    private companion object {
        const val CACHE_MS = 4_000L
    }
}
