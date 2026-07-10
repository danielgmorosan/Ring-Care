package ai.obrigada.guardian.ui

import ai.obrigada.guardian.data.BackendApi
import ai.obrigada.guardian.data.IdentityStore
import ai.obrigada.guardian.data.PairingException
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * First run: the caregiver reads a claim code from the family app and types it here to
 * bind this phone to their home. On success the identity is stored and [onPaired] fires.
 */
@Composable
fun PairingScreen(
    api: BackendApi,
    store: IdentityStore,
    onPaired: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().padding(PaddingValues(32.dp)),
        verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Set up your guardian",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            text = "Enter the pairing code from the Obrigada app on your phone.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )

        OutlinedTextField(
            value = code,
            onValueChange = {
                code = it.uppercase()
                error = null
            },
            label = { Text("Pairing code") },
            placeholder = { Text("ABCD-EFGH") },
            singleLine = true,
            enabled = !busy,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.widthIn(max = 360.dp),
        )

        Button(
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        val response = api.provision(code.trim())
                        store.save(response)
                        onPaired()
                    } catch (e: PairingException) {
                        error = e.message
                    } catch (e: Exception) {
                        error = "Something went wrong. Please try again."
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && code.isNotBlank(),
            modifier = Modifier.widthIn(max = 360.dp),
        ) {
            if (busy) {
                CircularProgressIndicator(
                    modifier = Modifier.padding(end = 12.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
            Text(if (busy) "Pairing…" else "Pair this phone")
        }

        error?.let {
            Text(
                text = it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
    }
}
