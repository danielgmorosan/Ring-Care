package ai.obrigada.guardian

import ai.obrigada.guardian.link.LinkStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * App-wide, in-memory status the running screen observes. The service owns the link and
 * pushes status here; the UI is a passive reader. Not persisted — it reflects the live
 * connection, nothing about the person.
 */
object GuardianState {

    private val _link = MutableStateFlow(LinkStatus.Idle)
    val link: StateFlow<LinkStatus> = _link.asStateFlow()

    private val _lastHeartbeatAt = MutableStateFlow<Long?>(null)
    val lastHeartbeatAt: StateFlow<Long?> = _lastHeartbeatAt.asStateFlow()

    fun updateLink(status: LinkStatus) {
        _link.value = status
    }

    fun markHeartbeat(epochMillis: Long) {
        _lastHeartbeatAt.value = epochMillis
    }
}
