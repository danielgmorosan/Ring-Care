package ai.obrigada.guardian.link

import kotlinx.serialization.Serializable

/**
 * MQTT topic contracts, mirroring packages/shared/src/mqtt/topics.ts. Topics are
 * per-device so the broker ACL scopes each guardian's certificate to only its own
 * subtree — one compromised phone can never touch another device's topics.
 */
object Topics {
    private const val ROOT = "obrigada"

    fun events(deviceId: String) = "$ROOT/dev/$deviceId/events"

    fun heartbeat(deviceId: String) = "$ROOT/dev/$deviceId/heartbeat"

    fun commands(deviceId: String) = "$ROOT/dev/$deviceId/cmd"

    fun ack(deviceId: String) = "$ROOT/dev/$deviceId/ack"
}

/**
 * Heartbeat message, mirroring packages/shared/src/events/heartbeat.ts. deviceId is NOT
 * in the body — the broker takes it from the topic and the certificate CN, which are
 * authoritative. Operational telemetry only; never anything about the person.
 */
@Serializable
data class HeartbeatMessage(
    val time: String,
    val batteryPct: Int? = null,
    val thermalC: Double? = null,
    val appVersion: String? = null,
    val models: Map<String, String>? = null,
)

/**
 * A backend to device command (F2.6), mirroring packages/shared/src/mqtt/commands.ts. Arrives
 * on the device's own cmd topic. "wipe" is a decommission: the guardian clears its encrypted
 * storage, including the face embeddings that never left it (rule #4). commandId lets the
 * device ack and de-duplicate a redelivery.
 */
@Serializable
data class DeviceCommand(
    val commandId: String,
    val command: String,
    val issuedAt: String,
)
