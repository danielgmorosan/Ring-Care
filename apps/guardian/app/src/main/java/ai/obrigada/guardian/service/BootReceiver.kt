package ai.obrigada.guardian.service

import ai.obrigada.guardian.data.IdentityStore
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts the guardian after a reboot so a power blip does not leave the home unwatched.
 * Only starts the link if the phone is already paired — an unpaired phone has nothing to do.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (IdentityStore(context).isPaired) {
            GuardianService.start(context)
        }
    }
}
