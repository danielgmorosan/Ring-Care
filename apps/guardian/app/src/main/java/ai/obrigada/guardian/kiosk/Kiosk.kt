package ai.obrigada.guardian.kiosk

import android.app.Activity
import android.util.Log

/**
 * Kiosk / lock-task helpers. The guardian is meant to run full-screen and locked so a
 * confused elder cannot navigate away or close it. Full unattended kiosk needs this app
 * set as device owner (adb: `dpm set-device-owner ai.obrigada.guardian/...`), after which
 * startLockTask locks silently. Without device owner, Android shows a "screen pinned"
 * prompt the first time — good enough for on-device testing.
 */
object Kiosk {
    private const val TAG = "Kiosk"

    fun enter(activity: Activity) {
        try {
            activity.startLockTask()
        } catch (e: Exception) {
            Log.w(TAG, "startLockTask failed (not device owner?): ${e.message}")
        }
    }

    fun exit(activity: Activity) {
        try {
            activity.stopLockTask()
        } catch (e: Exception) {
            Log.w(TAG, "stopLockTask failed: ${e.message}")
        }
    }
}
