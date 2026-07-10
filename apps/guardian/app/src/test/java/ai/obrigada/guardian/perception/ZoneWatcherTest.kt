package ai.obrigada.guardian.perception

import ai.obrigada.guardian.data.Zone
import ai.obrigada.guardian.data.ZoneVertex
import ai.obrigada.guardian.link.EventEnvelope
import ai.obrigada.guardian.link.EventTypes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Zone crossing decides whether stepping toward the stove or out the door raises an alert, so
 * the geometry and the enter/exit transitions are pinned: entry and exit fire once each on a
 * crossing, never while the person merely lingers, and a concave polygon is handled correctly.
 */
class ZoneWatcherTest {

    private val square =
        Zone(
            id = "stove",
            name = "Stove",
            kind = "hazard",
            points =
                listOf(
                    ZoneVertex(0.2f, 0.2f),
                    ZoneVertex(0.8f, 0.2f),
                    ZoneVertex(0.8f, 0.8f),
                    ZoneVertex(0.2f, 0.8f),
                ),
        )

    @Test
    fun `point-in-polygon distinguishes inside from outside`() {
        assertTrue(ZoneGeometry.contains(square.points, 0.5f, 0.5f))
        assertFalse(ZoneGeometry.contains(square.points, 0.9f, 0.9f))
        assertFalse(ZoneGeometry.contains(square.points, 0.1f, 0.5f))
    }

    @Test
    fun `entry and exit each fire once on a crossing, not while lingering`() {
        val events = mutableListOf<EventEnvelope>()
        val watcher = ZoneWatcher("dev-1") { events.add(it) }
        watcher.setZones(listOf(square))

        watcher.update(0.9f, 0.1f) // outside → nothing
        assertTrue(events.isEmpty())

        watcher.update(0.5f, 0.5f) // crossed in → entry
        assertEquals(1, events.size)
        assertEquals(EventTypes.ZONE_ENTRY, events.last().type)

        watcher.update(0.6f, 0.6f) // still inside → no new event
        assertEquals(1, events.size)

        watcher.update(0.95f, 0.95f) // crossed out → exit
        assertEquals(2, events.size)
        assertEquals(EventTypes.ZONE_EXIT, events.last().type)
    }

    @Test
    fun `a concave polygon does not report the notch as inside`() {
        // An arrow/notch shape: the dent around (0.5, 0.6) is outside the polygon.
        val concave =
            Zone(
                id = "z",
                name = "Notch",
                kind = "hazard",
                points =
                    listOf(
                        ZoneVertex(0.2f, 0.2f),
                        ZoneVertex(0.8f, 0.2f),
                        ZoneVertex(0.8f, 0.8f),
                        ZoneVertex(0.5f, 0.4f),
                        ZoneVertex(0.2f, 0.8f),
                    ),
            )
        assertTrue(ZoneGeometry.contains(concave.points, 0.3f, 0.3f))
        assertFalse(ZoneGeometry.contains(concave.points, 0.5f, 0.7f))
    }

    @Test
    fun `removing a zone forgets its state`() {
        val events = mutableListOf<EventEnvelope>()
        val watcher = ZoneWatcher("dev-1") { events.add(it) }
        watcher.setZones(listOf(square))
        watcher.update(0.5f, 0.5f) // entry
        assertEquals(1, events.size)

        watcher.setZones(emptyList()) // zone removed
        watcher.update(0.5f, 0.5f) // no zones → nothing
        assertEquals(1, events.size)
    }
}
