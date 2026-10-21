package ai.obrigada.guardian.perception

import ai.obrigada.guardian.link.EventEnvelope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Decouples the on-device perception (running in the camera pipeline) from the link
 * (owned by the service). The analyzer emits derived events here; GuardianService
 * collects them and publishes over the mutual-TLS MQTT link. Only structured events
 * flow through — never frames (CONTRIBUTING.md rule #1).
 */
object PerceptionBus {
    private val _events =
        MutableSharedFlow<EventEnvelope>(
            replay = 0,
            extraBufferCapacity = 16,
        )
    val events = _events.asSharedFlow()

    /** Non-blocking; safe to call from the camera analysis thread. */
    fun emit(event: EventEnvelope) {
        _events.tryEmit(event)
    }
}
