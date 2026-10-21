package ai.obrigada.guardian.ui

import ai.obrigada.guardian.data.RosterEntry
import ai.obrigada.guardian.data.RosterSuggestions
import ai.obrigada.guardian.perception.EnrolledFace
import ai.obrigada.guardian.perception.FaceRecognizer
import ai.obrigada.guardian.perception.FaceStore
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AssistChip
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Face enrollment for the household (F2.2). A caregiver names a person and holds the camera
 * on their face; the guardian captures the embedding and stores it encrypted on-device. The
 * face vector and any capture never leave the phone (CONTRIBUTING.md rule #4) — this whole flow is
 * on-device by design.
 */
@Composable
fun FaceEnrollment(
    store: FaceStore,
    recognizer: FaceRecognizer,
    roster: List<RosterEntry> = emptyList(),
    onClose: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var capturing by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }
    var enrolled by remember { mutableStateOf(store.list()) }

    fun capture() {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        capturing = true
        status = "Hold the camera on ${trimmed}'s face…"
        recognizer.startEnrollment(trimmed) { success ->
            capturing = false
            if (success) {
                enrolled = store.list()
                status = "Added ${trimmed}."
                name = ""
            } else {
                status = "No clear face seen. Try again, well lit and facing the camera."
            }
        }
    }

    Column(
        modifier =
            Modifier.fillMaxSize().background(Color(0xF2111311)).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Who lives here?",
            style = MaterialTheme.typography.headlineSmall,
            color = Color(0xFFF3F1EC),
        )
        Text(
            text =
                "Add the people Obrigada should recognize, so it only flags a stranger. Their " +
                    "faces stay on this phone and are never uploaded.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFFBFC4BE),
            textAlign = TextAlign.Center,
        )

        // The family's roster, from the family app. Tap a name to fill it in, so the caregiver
        // does not type it twice. Only the names still to enroll are offered.
        val pending = RosterSuggestions.pending(roster, enrolled.map { it.name })
        if (pending.isNotEmpty()) {
            Text(
                text = "From your family list",
                style = MaterialTheme.typography.labelMedium,
                color = Color(0xFF8F958D),
            )
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                pending.forEach { person ->
                    AssistChip(
                        onClick = { if (!capturing) name = person.title },
                        label = { Text(person.title) },
                    )
                }
            }
        }

        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Name") },
            singleLine = true,
            enabled = !capturing,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { capture() },
            enabled = !capturing && name.trim().isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (capturing) "Capturing…" else "Capture face")
        }
        status?.let {
            Text(it, color = Color(0xFFBFC4BE), style = MaterialTheme.typography.bodySmall)
        }

        if (enrolled.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp)) {
                    enrolled.forEach { face -> EnrolledRow(face) { store.remove(face.id); enrolled = store.list() } }
                }
            }
        }

        TextButton(onClick = onClose) { Text("Done") }
    }
}

@Composable
private fun EnrolledRow(face: EnrolledFace, onRemove: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(face.name, style = MaterialTheme.typography.bodyLarge)
        TextButton(onClick = onRemove) { Text("Remove") }
    }
}
