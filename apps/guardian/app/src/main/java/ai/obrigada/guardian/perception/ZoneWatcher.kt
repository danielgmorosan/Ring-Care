package ai.obrigada.guardian.perception

import ai.obrigada.guardian.data.Zone
import ai.obrigada.guardian.link.EventEnvelope
import ai.obrigada.guardian.link.EventTypes
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.util.UUID

/**
 * Watches the person's position against the device's zones (F2.3) and emits a zone.entry when
 * they cross in and a zone.exit when they cross out — one event per transition, keyed by
 * zone id. The backend's zone evaluator turns an entry into a hazard zone into an alert, and
 * a door-zone exit drives the wandering logic. Only the zone id and a timestamp leave (rule
 * #1); the geometry ran on-device.
 *
 * [update] is called from the pose pipeline (a single analysis thread); [setZones] from the
 * UI when the active set is synced. Zones is volatile; the inside-state map is touched only
 * from the analysis thread.
 */
class ZoneWatcher(
    private val deviceId: String,
    private val onEvent: (EventEnvelope) -> Unit = PerceptionBus::emit,
) {
    @Volatile private var zones: List<Zone> = emptyList()
    private val inside = HashMap<String, Boolean>()

    fun setZones(active: List<Zone>) {
        zones = active
        // Forget state for zones that no longer exist so a stale id never lingers.
        val ids = active.map { it.id }.toSet()
        inside.keys.retainAll(ids)
    }

    /** Feed the person's normalized ground position; emits transitions since the last call. */
    fun update(x: Float, y: Float) {
        for (zone in zones) {
            val nowInside = ZoneGeometry.contains(zone.points, x, y)
            val wasInside = inside[zone.id] ?: false
            if (nowInside != wasInside) {
                inside[zone.id] = nowInside
                onEvent(if (nowInside) entryEvent(zone) else exitEvent(zone))
            }
        }
    }

    private fun entryEvent(zone: Zone): EventEnvelope = zoneEvent(EventTypes.ZONE_ENTRY, zone)

    private fun exitEvent(zone: Zone): EventEnvelope = zoneEvent(EventTypes.ZONE_EXIT, zone)

    private fun zoneEvent(type: String, zone: Zone): EventEnvelope =
        EventEnvelope(
            eventId = UUID.randomUUID().toString(),
            deviceId = deviceId,
            type = type,
            occurredAt = Instant.now().toString(),
            // The backend resolves the zone id to its name and kind; only the id travels.
            payload = buildJsonObject { put("zoneId", zone.id) },
        )
}
