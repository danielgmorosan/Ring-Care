package ai.obrigada.guardian

import ai.obrigada.guardian.service.GuardianService
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager

class GuardianApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // The link's foreground-service notification lives on a low-importance channel:
        // it is a persistent "I'm watching" indicator, not something that should buzz.
        val channel =
            NotificationChannel(
                GuardianService.CHANNEL_ID,
                "Guardian link",
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Shows that Obrigada is connected and watching." }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
