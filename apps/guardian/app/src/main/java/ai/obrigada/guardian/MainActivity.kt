package ai.obrigada.guardian

import ai.obrigada.guardian.data.BackendApi
import ai.obrigada.guardian.data.IdentityStore
import ai.obrigada.guardian.kiosk.Kiosk
import ai.obrigada.guardian.service.GuardianService
import ai.obrigada.guardian.ui.PairingScreen
import ai.obrigada.guardian.ui.RunningScreen
import ai.obrigada.guardian.ui.theme.GuardianTheme
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

/**
 * The single activity. First run shows pairing; once bound it shows the running guardian
 * and starts the always-on link service. Runs full-screen, screen-on, and (best effort)
 * in lock-task kiosk so a confused elder cannot navigate away.
 */
class MainActivity : ComponentActivity() {

    private val store by lazy { IdentityStore(this) }
    private val api = BackendApi()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContent {
            GuardianTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    var paired by remember { mutableStateOf(store.isPaired) }
                    var hasCamera by remember { mutableStateOf(hasCameraPermission()) }

                    val cameraLauncher =
                        rememberLauncherForActivityResult(RequestPermission()) { granted ->
                            hasCamera = granted
                        }
                    val notificationLauncher =
                        rememberLauncherForActivityResult(RequestPermission()) { /* best effort */ }
                    val micLauncher =
                        rememberLauncherForActivityResult(RequestPermission()) { /* best effort */ }

                    if (!paired) {
                        PairingScreen(api = api, store = store) {
                            paired = true
                            GuardianService.start(this@MainActivity)
                        }
                    } else {
                        LaunchedEffect(Unit) {
                            GuardianService.start(this@MainActivity)
                            requestNotificationsIfNeeded { notificationLauncher.launch(it) }
                            if (!hasCamera) cameraLauncher.launch(Manifest.permission.CAMERA)
                            // The safety voice check-in listens for the elder's answer.
                            if (!hasPermission(Manifest.permission.RECORD_AUDIO)) {
                                micLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                        if (hasCamera) {
                            RunningScreen()
                        } else {
                            CameraNeeded { cameraLauncher.launch(Manifest.permission.CAMERA) }
                        }
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Lock into kiosk once the phone is set up. No-op (with a log) if not device owner.
        if (store.isPaired) Kiosk.enter(this)
    }

    private fun hasCameraPermission(): Boolean = hasPermission(Manifest.permission.CAMERA)

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun requestNotificationsIfNeeded(launch: (String) -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted =
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
                    PackageManager.PERMISSION_GRANTED
            if (!granted) launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

@Composable
private fun CameraNeeded(onGrant: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Obrigada needs the camera to watch over your home.",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onGrant) { Text("Allow camera") }
    }
}
