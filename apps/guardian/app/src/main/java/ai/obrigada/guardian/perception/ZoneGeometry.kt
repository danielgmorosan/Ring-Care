package ai.obrigada.guardian.perception

import ai.obrigada.guardian.data.ZoneVertex

/**
 * Pure zone geometry (F2.3). Point-in-polygon so the guardian can decide, on-device, whether
 * the person is standing in a zone — no pixels, just coordinates. Kept pure so the test suite
 * pins the boundary behavior (a person on the stove edge, a concave doorway) exactly.
 */
object ZoneGeometry {

    /**
     * Ray-casting point-in-polygon. Handles convex and concave polygons. A point exactly on
     * an edge is treated as inside for the "did they step in" question — we would rather flag
     * a boundary case than miss a hazard.
     */
    fun contains(polygon: List<ZoneVertex>, x: Float, y: Float): Boolean {
        if (polygon.size < 3) return false
        var inside = false
        var j = polygon.size - 1
        for (i in polygon.indices) {
            val xi = polygon[i].x
            val yi = polygon[i].y
            val xj = polygon[j].x
            val yj = polygon[j].y
            val intersects =
                (yi > y) != (yj > y) &&
                    x < (xj - xi) * (y - yi) / ((yj - yi).let { if (it == 0f) 1e-9f else it }) + xi
            if (intersects) inside = !inside
            j = i
        }
        return inside
    }
}
