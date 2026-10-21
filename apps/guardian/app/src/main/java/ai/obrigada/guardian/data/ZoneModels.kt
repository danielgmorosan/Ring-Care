package ai.obrigada.guardian.data

import kotlinx.serialization.Serializable

/** A polygon vertex, normalized to [0,1] in the device frame (mirrors the backend). */
@Serializable
data class ZoneVertex(val x: Float, val y: Float)

/**
 * A zone drawn on this guardian's camera (F2.3), as stored by the backend. `kind` is
 * "hazard" (alerts on entry) or "door" (drives the wandering logic). Points are normalized
 * so the polygon survives resolution changes. The device runs the geometry locally; the
 * frame the zone was drawn over never leaves it (CONTRIBUTING.md rule #1).
 */
@Serializable
data class Zone(
    val id: String,
    val deviceId: String = "",
    val familyId: String = "",
    val name: String,
    val kind: String,
    val points: List<ZoneVertex>,
    val active: Boolean = true,
    val createdAt: String = "",
)

/** The body of a device-drawn zone the guardian posts to the backend. */
@Serializable
data class CreateZoneBody(
    val deviceId: String,
    val name: String,
    val kind: String,
    val points: List<ZoneVertex>,
)
