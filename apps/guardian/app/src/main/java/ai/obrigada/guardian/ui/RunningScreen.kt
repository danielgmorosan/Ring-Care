package ai.obrigada.guardian.ui

import ai.obrigada.guardian.GuardianState
import ai.obrigada.guardian.data.IdentityStore
import ai.obrigada.guardian.data.RosterClient
import ai.obrigada.guardian.data.RosterEntry
import ai.obrigada.guardian.data.ZonesClient
import ai.obrigada.guardian.kiosk.Kiosk
import ai.obrigada.guardian.link.LinkStatus
import ai.obrigada.guardian.perception.FaceRecognizer
import ai.obrigada.guardian.perception.FaceStore
import ai.obrigada.guardian.perception.PoseAnalyzer
import ai.obrigada.guardian.perception.ZoneWatcher
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.concurrent.Executors

/**
 * The running guardian: a live camera preview with on-device pose analysis feeding fall
 * detection (F1.2), and a small connection-status pill. Frames are read in memory only —
 * the analyzer emits labelled events; no pixels ever leave (CLAUDE.md rule #1).
 */
@Composable
fun RunningScreen(onReset: () -> Unit = {}) {
    val status by GuardianState.link.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val store = remember { IdentityStore(context) }
    val identity = remember { store.load() }
    val deviceId = identity?.deviceId

    // Setup mode until the caregiver taps "Start watching". Kept out of kiosk so setup is
    // never trapped; enters kiosk on start, and a long-press on the status pill drops back
    // to setup for maintenance.
    var watching by remember { mutableStateOf(store.isSetupComplete) }
    val activity = context.findActivity()

    val faceStore = remember { FaceStore(context) }
    val faceRecognizer =
        remember(deviceId) { deviceId?.let { FaceRecognizer(context, it, faceStore) } }
    val zoneWatcher = remember(deviceId) { deviceId?.let { ZoneWatcher(it) } }
    val zonesClient =
        remember(identity) { identity?.let { ZonesClient(it.deviceId, it.deviceToken) } }
    val rosterClient =
        remember(identity) { identity?.let { RosterClient(it.deviceId, it.deviceToken) } }
    val analyzer =
        remember(deviceId, faceRecognizer, zoneWatcher) {
            deviceId?.let {
                PoseAnalyzer(context, it, faceRecognizer = faceRecognizer, zoneWatcher = zoneWatcher)
            }
        }
    val executor = remember { Executors.newSingleThreadExecutor() }
    DisposableEffect(analyzer) {
        onDispose {
            analyzer?.close()
            faceRecognizer?.close()
            executor.shutdown()
        }
    }

    // Sync the device's zones so the geometry engine has something to watch.
    LaunchedEffect(zonesClient) {
        if (zonesClient != null && zoneWatcher != null) {
            zoneWatcher.setZones(zonesClient.fetch())
        }
    }

    var showEnroll by remember { mutableStateOf(false) }
    var showDraw by remember { mutableStateOf(false) }

    // Pull the family's roster so enrollment can offer their names (falls back to typing).
    var roster by remember { mutableStateOf<List<RosterEntry>>(emptyList()) }
    LaunchedEffect(rosterClient, showEnroll) {
        if (rosterClient != null && showEnroll) {
            roster = rosterClient.fetch()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        CameraPreview(analyzer = analyzer, executor = executor, modifier = Modifier.fillMaxSize())
        StatusPill(
            status = status,
            modifier =
                Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
                    .pointerInput(watching) {
                        // While watching (kiosk on), a long-press here is the maintenance exit:
                        // leave kiosk and return to setup to change faces or zones.
                        if (watching) {
                            detectTapGestures(
                                onLongPress = {
                                    activity?.let { Kiosk.exit(it) }
                                    store.markSetupIncomplete()
                                    watching = false
                                },
                            )
                        }
                    },
        )
        // Setup controls: shown only before "Start watching", so the elder never sees them
        // and the caregiver is never trapped behind kiosk while setting up.
        if (!watching) {
            Column(
                modifier = Modifier.align(Alignment.TopEnd).padding(16.dp),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (faceRecognizer?.isAvailable == true) {
                    SetupPill(label = "Set up faces", onOpen = { showEnroll = true })
                }
                if (zonesClient != null) {
                    SetupPill(label = "Draw a zone", onOpen = { showDraw = true })
                }
            }
            SetupBar(
                modifier = Modifier.align(Alignment.BottomCenter).padding(24.dp),
                onStartWatching = {
                    store.markSetupComplete()
                    watching = true
                    activity?.let { Kiosk.enter(it) }
                },
                onReset = onReset,
            )
        }
        if (showEnroll && faceRecognizer != null) {
            FaceEnrollment(
                store = faceStore,
                recognizer = faceRecognizer,
                roster = roster,
                onClose = { showEnroll = false },
            )
        }
        if (showDraw && zonesClient != null && zoneWatcher != null) {
            ZoneDrawing(
                client = zonesClient,
                onSynced = { zones -> zoneWatcher.setZones(zones) },
                onClose = { showDraw = false },
            )
        }
    }
}

@Composable
private fun SetupPill(label: String, onOpen: () -> Unit) {
    Row(
        modifier =
            Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xCC1B1E1B))
                .clickable(onClick = onOpen)
                .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = Color(0xFFF3F1EC),
        )
    }
}

/** The setup panel shown before "Start watching": guidance, the start button, and re-pair. */
@Composable
private fun SetupBar(
    modifier: Modifier = Modifier,
    onStartWatching: () -> Unit,
    onReset: () -> Unit,
) {
    Column(
        modifier =
            modifier
                .clip(RoundedCornerShape(22.dp))
                .background(Color(0xF21B1E1B))
                .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text =
                "Setup. Add the people who live here and draw any red zones, " +
                    "then start watching.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFFBFC4BE),
            textAlign = TextAlign.Center,
        )
        Button(onClick = onStartWatching, modifier = Modifier.fillMaxWidth()) {
            Text("Start watching")
        }
        TextButton(onClick = onReset) { Text("Re-pair this guardian") }
    }
}

/** Unwrap the Activity from a Compose context, for kiosk lock-task control. */
private fun Context.findActivity(): Activity? {
    var ctx: Context? = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

@Composable
private fun CameraPreview(
    analyzer: PoseAnalyzer?,
    executor: java.util.concurrent.Executor,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val future = ProcessCameraProvider.getInstance(ctx)
            future.addListener(
                {
                    try {
                        val provider = future.get()
                        val preview =
                            Preview.Builder().build().also {
                                it.setSurfaceProvider(previewView.surfaceProvider)
                            }
                        val useCases = mutableListOf<androidx.camera.core.UseCase>(preview)
                        if (analyzer != null) {
                            val analysis =
                                ImageAnalysis.Builder()
                                    .setBackpressureStrategy(
                                        ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST,
                                    )
                                    .setOutputImageFormat(
                                        ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888,
                                    )
                                    .build()
                                    .also { it.setAnalyzer(executor, analyzer) }
                            useCases.add(analysis)
                        }
                        provider.unbindAll()
                        provider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_FRONT_CAMERA,
                            *useCases.toTypedArray(),
                        )
                    } catch (e: Exception) {
                        Log.e("RunningScreen", "camera bind failed: ${e.message}")
                    }
                },
                ContextCompat.getMainExecutor(ctx),
            )
            previewView
        },
    )
}

@Composable
private fun StatusPill(status: LinkStatus, modifier: Modifier = Modifier) {
    val (label, dot) =
        when (status) {
            LinkStatus.Online -> "Watching" to Color(0xFF3F8F6B)
            LinkStatus.Connecting -> "Connecting" to Color(0xFFE0B45B)
            LinkStatus.Reconnecting -> "Reconnecting" to Color(0xFFE0B45B)
            LinkStatus.Error -> "Offline" to Color(0xFFE5786B)
            LinkStatus.Idle -> "Starting" to Color(0xFF8A8F8A)
        }

    Row(
        modifier =
            modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xCC111311))
                .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(dot))
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = Color(0xFFF3F1EC),
        )
    }
}
