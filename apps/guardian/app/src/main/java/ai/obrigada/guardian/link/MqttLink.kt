package ai.obrigada.guardian.link

import ai.obrigada.guardian.data.DeviceIdentity
import android.util.Log
import kotlinx.serialization.json.Json
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken
import org.eclipse.paho.client.mqttv3.MqttAsyncClient
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended
import org.eclipse.paho.client.mqttv3.MqttConnectOptions
import org.eclipse.paho.client.mqttv3.MqttMessage
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence

/** The connection lifecycle the UI cares about. */
enum class LinkStatus { Idle, Connecting, Online, Reconnecting, Error }

/**
 * The guardian's mutual-TLS MQTT link. Wraps Eclipse Paho: connects to EMQX with the
 * device certificate (the broker derives the MQTT username from the cert CN), auto-
 * reconnects, and publishes heartbeats/events to the device's own topics. QoS 1 so an
 * alert survives a flaky connection (offline-first, at-least-once).
 */
class MqttLink(
    private val identity: DeviceIdentity,
    /** Backend to device commands (F2.6) arriving on the cmd topic; null to ignore them. */
    private val onCommand: ((DeviceCommand) -> Unit)? = null,
) {

    private val json = Json { ignoreUnknownKeys = true }
    private var client: MqttAsyncClient? = null
    private val commandTopic = Topics.commands(identity.deviceId)

    fun connect(onStatus: (LinkStatus) -> Unit) {
        require(identity.hasMutualTls) { "MqttLink needs full mutual-TLS material" }
        val brokerUri = toPahoUri(identity.mqttUrl!!)
        onStatus(LinkStatus.Connecting)

        val mqtt = MqttAsyncClient(brokerUri, identity.deviceId, MemoryPersistence())
        mqtt.setCallback(
            object : MqttCallbackExtended {
                override fun connectComplete(reconnect: Boolean, serverUri: String?) {
                    Log.i(TAG, if (reconnect) "reconnected to $serverUri" else "connected to $serverUri")
                    // (Re)subscribe to the command topic; QoS 1 so a wipe is not missed.
                    if (onCommand != null) {
                        runCatching { mqtt.subscribe(commandTopic, 1) }
                            .onFailure { Log.w(TAG, "cmd subscribe failed: ${it.message}") }
                    }
                    onStatus(LinkStatus.Online)
                }

                override fun connectionLost(cause: Throwable?) {
                    Log.w(TAG, "connection lost: ${cause?.message}")
                    onStatus(LinkStatus.Reconnecting)
                }

                override fun messageArrived(topic: String?, message: MqttMessage?) {
                    if (topic != commandTopic || message == null || onCommand == null) return
                    runCatching {
                        onCommand.invoke(
                            json.decodeFromString(DeviceCommand.serializer(), String(message.payload)),
                        )
                    }.onFailure { Log.w(TAG, "bad command message: ${it.message}") }
                }

                override fun deliveryComplete(token: IMqttDeliveryToken?) = Unit
            }
        )

        val options =
            MqttConnectOptions().apply {
                socketFactory =
                    PemIdentity.socketFactory(
                        certPem = identity.deviceCertPem!!,
                        keyPem = identity.deviceKeyPem!!,
                        caPem = identity.caCertPem!!,
                    )
                isCleanSession = true
                isAutomaticReconnect = true
                connectionTimeout = 15
                keepAliveInterval = maxOf(30, identity.heartbeatIntervalSeconds * 2)
                // EMQX authenticates by client certificate; no username/password.
            }

        try {
            mqtt.connect(options)
        } catch (e: Exception) {
            Log.e(TAG, "connect failed: ${e.message}")
            onStatus(LinkStatus.Error)
        }
        client = mqtt
    }

    /** Whether the link is currently connected — the outbox drains only when it is. */
    val isConnected: Boolean
        get() = client?.isConnected == true

    /** Publish a heartbeat JSON payload to this device's heartbeat topic (QoS 1). */
    fun publishHeartbeat(json: String) = publish(Topics.heartbeat(identity.deviceId), json)

    /** Publish a derived event to the device's event topic (QoS 1). Returns true if sent. */
    fun publishEvent(json: String): Boolean = publish(Topics.events(identity.deviceId), json)

    private fun publish(topic: String, json: String): Boolean {
        val mqtt = client ?: return false
        if (!mqtt.isConnected) return false
        return try {
            mqtt.publish(topic, MqttMessage(json.toByteArray()).apply { qos = 1 })
            true
        } catch (e: Exception) {
            Log.w(TAG, "publish to $topic failed: ${e.message}")
            false
        }
    }

    fun disconnect() {
        val mqtt = client ?: return
        try {
            if (mqtt.isConnected) mqtt.disconnect()
            mqtt.close()
        } catch (e: Exception) {
            Log.w(TAG, "disconnect failed: ${e.message}")
        } finally {
            client = null
        }
    }

    private fun toPahoUri(mqttUrl: String): String =
        when {
            mqttUrl.startsWith("mqtts://") -> mqttUrl.replaceFirst("mqtts://", "ssl://")
            mqttUrl.startsWith("mqtt://") -> mqttUrl.replaceFirst("mqtt://", "tcp://")
            else -> mqttUrl
        }

    private companion object {
        const val TAG = "MqttLink"
    }
}
