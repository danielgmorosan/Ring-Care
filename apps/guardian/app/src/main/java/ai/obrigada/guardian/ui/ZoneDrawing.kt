package ai.obrigada.guardian.ui

import ai.obrigada.guardian.data.Zone
import ai.obrigada.guardian.data.ZoneVertex
import ai.obrigada.guardian.data.ZonesClient
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

private val HAZARD = Color(0xFFE5786B)
private val DOOR = Color(0xFF5B9DE0)

/**
 * Draw a zone on the guardian's own camera view (F2.3). The caregiver taps the polygon corners
 * over the live preview, names it, and picks hazard or door; the guardian posts it to the
 * backend and re-syncs. The frame is never captured — only the normalized polygon is sent
 * (rule #1). This runs on the device precisely because the camera view stays on the device.
 */
@Composable
fun ZoneDrawing(
    client: ZonesClient,
    onSynced: (List<Zone>) -> Unit,
    onClose: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var points by remember { mutableStateOf(listOf<Offset>()) } // normalized [0,1]
    var name by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("hazard") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val tint = if (kind == "hazard") HAZARD else DOOR

    fun save() {
        if (points.size < 3 || name.isBlank()) return
        saving = true
        error = null
        scope.launch {
            try {
                client.create(name.trim(), kind, points.map { ZoneVertex(it.x, it.y) })
                onSynced(client.fetch())
                onClose()
            } catch (e: Exception) {
                error = e.message ?: "Could not save the zone."
                saving = false
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // The drawing surface sits over the live preview; taps add polygon corners.
        Canvas(
            modifier =
                Modifier
                    .fillMaxSize()
                    .weight(1f)
                    .pointerInput(Unit) {
                        detectTapGestures { offset ->
                            // size here is the PointerInputScope's element size in pixels.
                            if (size.width > 0 && size.height > 0) {
                                points =
                                    points +
                                        Offset(
                                            (offset.x / size.width).coerceIn(0f, 1f),
                                            (offset.y / size.height).coerceIn(0f, 1f),
                                        )
                            }
                        }
                    },
        ) {
            val w = this.size.width
            val h = this.size.height
            val pixels = points.map { Offset(it.x * w, it.y * h) }
            if (pixels.size >= 2) {
                val path = Path().apply {
                    moveTo(pixels.first().x, pixels.first().y)
                    pixels.drop(1).forEach { lineTo(it.x, it.y) }
                    if (pixels.size >= 3) close()
                }
                if (pixels.size >= 3) drawPath(path, color = tint.copy(alpha = 0.25f))
                drawPath(path, color = tint, style = Stroke(width = 4f))
            }
            pixels.forEach { drawCircle(color = tint, radius = 10f, center = it) }
        }

        Card(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Tap the corners of the area on the camera, then name it.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Zone name") },
                    singleLine = true,
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KindChip("Hazard", kind == "hazard") { kind = "hazard" }
                    KindChip("Door", kind == "door") { kind = "door" }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { if (points.isNotEmpty()) points = points.dropLast(1) }) {
                        Text("Undo")
                    }
                    TextButton(onClick = { points = emptyList() }) { Text("Clear") }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { save() },
                        enabled = !saving && points.size >= 3 && name.isNotBlank(),
                    ) {
                        Text(if (saving) "Saving…" else "Save zone")
                    }
                    TextButton(onClick = onClose, enabled = !saving) { Text("Done") }
                }
            }
        }
    }
}

@Composable
private fun KindChip(label: String, selected: Boolean, onSelect: () -> Unit) {
    if (selected) {
        Button(onClick = onSelect) { Text(label) }
    } else {
        TextButton(onClick = onSelect) { Text(label) }
    }
}
