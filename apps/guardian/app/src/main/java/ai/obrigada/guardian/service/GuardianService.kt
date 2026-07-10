package ai.obrigada.guardian.service

import ai.obrigada.guardian.BuildConfig
import ai.obrigada.guardian.GuardianState
import ai.obrigada.guardian.MainActivity
import ai.obrigada.guardian.R
import ai.obrigada.guardian.data.CommandAckClient
import ai.obrigada.guardian.data.DeviceIdentity
import ai.obrigada.guardian.data.IdentityStore
import ai.obrigada.guardian.link.DeviceCommand
import ai.obrigada.guardian.link.EventEnvelope
import ai.obrigada.guardian.link.EventTypes
import ai.obrigada.guardian.link.HeartbeatMessage
import ai.obrigada.guardian.link.LinkStatus
import ai.obrigada.guardian.link.MqttLink
import ai.obrigada.guardian.link.Outbox
import ai.obrigada.guardian.perception.FaceStore
import ai.obrigada.guardian.perception.PerceptionBus
import ai.obrigada.guardian.voice.CheckinLanguage
import ai.obrigada.guardian.voice.VoiceCheckin
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.time.Instant
import java.util.UUID

/**
 * The guardian's always-on link. A foreground service so Android keeps the mutual-TLS
 * MQTT connection and heartbeat alive while the phone sits on a wall, unattended. This
 * is the F1.1 foundation — perception pipelines (fall detection, recognition) will feed
 * events into the same link in later steps.
 */
class GuardianService : LifecycleService() {

    private val json = Json { encodeDefaults = false }
    private var link: MqttLink? = null
    private var voiceCheckin: VoiceCheckin? = null
    private var checkinRunning = false
    private val outbox by lazy { Outbox(File(filesDir, "outbox.json")) }
    private val drainMutex = Mutex()
    private val handledCommands = mutableSetOf<String>()

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        if (link == null) start()
        // Sticky: if Android kills us under memory pressure, restart so the home stays watched.
        return START_STICKY
    }

    private fun start() {
        val identity = IdentityStore(this).load()
        if (identity == null) {
            Log.w(TAG, "no identity; stopping")
            stopSelf()
            return
        }
        if (!identity.hasMutualTls) {
            // Token-only provisioning: nothing to connect yet. The phone is paired but the
            // device CA was not configured server-side, so there is no certificate to use.
            Log.w(TAG, "paired without mutual-TLS material; link idle until certs are issued")
            GuardianState.updateLink(LinkStatus.Idle)
            return
        }

        val mqtt = MqttLink(identity, onCommand = { command -> handleCommand(command, identity) })
        link = mqtt
        mqtt.connect { status ->
            GuardianState.updateLink(status)
            // When the link comes up (or back), flush anything queued while offline.
            if (status == LinkStatus.Online) lifecycleScope.launch { drainOutbox(mqtt) }
        }
        startHeartbeat(identity, mqtt)
        publishPerceptionEvents(identity, mqtt)
    }

    /**
     * Queue derived perception events durably and drain them over the link, and run the
     * on-device safety voice check-in (F1.3) when a fall is first suspected. Events go to a
     * disk-backed outbox first (offline-first): a fall seen during a network blip is replayed
     * on reconnect rather than lost. Delivery is at-least-once; the backend de-duplicates on
     * eventId.
     */
    private fun publishPerceptionEvents(identity: DeviceIdentity, mqtt: MqttLink) {
        lifecycleScope.launch {
            PerceptionBus.events.collect { event ->
                outbox.add(json.encodeToString(EventEnvelope.serializer(), event))
                drainOutbox(mqtt)
                if (event.type == EventTypes.FALL_SUSPECTED) {
                    startVoiceCheckin(identity)
                }
            }
        }
    }

    /** Publish queued events in order while the link is up, removing each on success. */
    private suspend fun drainOutbox(mqtt: MqttLink) {
        drainMutex.withLock {
            if (!mqtt.isConnected) return
            for (item in outbox.snapshot()) {
                if (mqtt.publishEvent(item.json)) {
                    outbox.remove(item.id)
                } else {
                    break // link dropped mid-drain; the rest waits for the next reconnect
                }
            }
        }
    }

    /**
     * A backend command arrived (F2.6). Only "wipe" is handled: the guardian erases its
     * encrypted storage — face embeddings (rule #4), the outbox, and its identity — acks that
     * it did so, and returns to the pairing screen. Idempotent on commandId so a QoS-1
     * redelivery does not re-run. Security-first: the wipe happens even if the ack cannot be
     * sent.
     */
    private fun handleCommand(command: DeviceCommand, identity: DeviceIdentity) {
        if (command.command != "wipe") {
            Log.w(TAG, "ignoring unknown command '${command.command}'")
            return
        }
        if (!handledCommands.add(command.commandId)) return // already wiped for this command
        Log.w(TAG, "remote wipe received (${command.commandId}); clearing this guardian")

        val ackClient = CommandAckClient(identity.deviceId, identity.deviceToken)
        lifecycleScope.launch {
            // Erase the sensitive on-device data first; biometrics must be gone even if the
            // rest of this fails.
            runCatching { FaceStore(this@GuardianService).clear() }
            runCatching { outbox.clear() }
            runCatching { ackClient.ack(command.commandId, "executed") }
                .onFailure { Log.w(TAG, "wipe ack failed (wipe still done): ${it.message}") }
            runCatching { IdentityStore(this@GuardianService).clear() }
            link?.disconnect()
            link = null
            GuardianState.updateLink(LinkStatus.Idle)
            stopSelf()
        }
    }

    private fun startVoiceCheckin(identity: DeviceIdentity) {
        if (checkinRunning) return // one check-in at a time; a confirm won't start a second
        checkinRunning = true
        val checkin = VoiceCheckin(this, CheckinLanguage.from(identity.checkinLanguage))
        voiceCheckin = checkin
        Log.i(TAG, "starting voice check-in (${identity.checkinLanguage})")
        checkin.run { result ->
            checkinRunning = false
            voiceCheckin = null
            Log.i(TAG, "voice check-in result: $result")
            PerceptionBus.emit(checkinEvent(identity.deviceId, result))
        }
    }

    private fun checkinEvent(deviceId: String, result: String): EventEnvelope =
        EventEnvelope(
            eventId = UUID.randomUUID().toString(),
            deviceId = deviceId,
            type = EventTypes.VOICE_CHECKIN_RESULT,
            occurredAt = Instant.now().toString(),
            payload = buildJsonObject { put("result", result) },
        )

    private fun startHeartbeat(identity: DeviceIdentity, mqtt: MqttLink) {
        val intervalMs = identity.heartbeatIntervalSeconds.coerceAtLeast(15) * 1000L
        lifecycleScope.launch {
            while (isActive) {
                val message =
                    HeartbeatMessage(
                        time = Instant.now().toString(),
                        batteryPct = readBatteryPct(),
                        appVersion = BuildConfig.VERSION_NAME,
                    )
                mqtt.publishHeartbeat(json.encodeToString(HeartbeatMessage.serializer(), message))
                GuardianState.markHeartbeat(System.currentTimeMillis())
                delay(intervalMs)
            }
        }
    }

    private fun readBatteryPct(): Int? {
        val bm = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return pct.takeIf { it in 0..100 }
    }

    private fun buildNotification(): Notification {
        val open =
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE,
            )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Obrigada is watching over your home")
            .setContentText("Connected and keeping an eye out.")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(open)
            .setOngoing(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    override fun onDestroy() {
        voiceCheckin?.cancel()
        voiceCheckin = null
        link?.disconnect()
        link = null
        GuardianState.updateLink(LinkStatus.Idle)
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "guardian_link"
        private const val NOTIFICATION_ID = 1
        private const val TAG = "GuardianService"

        fun start(context: Context) {
            val intent = Intent(context, GuardianService::class.java)
            context.startForegroundService(intent)
        }
    }
}
