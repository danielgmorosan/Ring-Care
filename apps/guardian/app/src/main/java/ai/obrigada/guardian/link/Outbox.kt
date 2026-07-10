package ai.obrigada.guardian.link

import android.util.Log
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/** One queued event awaiting delivery: a monotonic id and the serialized envelope. */
@Serializable
data class OutboxItem(val id: Long, val json: String)

/** The persisted queue state: the next id to assign and the pending items, oldest first. */
@Serializable
data class OutboxState(val nextId: Long = 1, val items: List<OutboxItem> = emptyList())

/**
 * Pure FIFO outbox logic (F1/offline-first). Events are appended and drained in order; if the
 * queue exceeds [maxSize] the oldest are dropped so a long outage cannot exhaust storage. No
 * IO here, so the ordering and cap behavior is unit-tested.
 */
class OutboxBuffer(private val maxSize: Int = 500) {
    private val items = ArrayDeque<OutboxItem>()
    private var nextId = 1L
    private var dropped = 0L

    fun add(json: String): OutboxItem {
        val item = OutboxItem(nextId++, json)
        items.addLast(item)
        while (items.size > maxSize) {
            items.removeFirst()
            dropped++
        }
        return item
    }

    fun remove(id: Long) {
        items.removeAll { it.id == id }
    }

    fun snapshot(): List<OutboxItem> = items.toList()

    val size: Int
        get() = items.size

    /** How many events were dropped to stay under the cap — surfaced so truncation is visible. */
    val droppedCount: Long
        get() = dropped

    fun state(): OutboxState = OutboxState(nextId, items.toList())

    fun restore(state: OutboxState) {
        items.clear()
        items.addAll(state.items)
        nextId = maxOf(state.nextId, (state.items.maxOfOrNull { it.id } ?: 0L) + 1)
    }
}

/**
 * Durable outbox for derived events (offline-first, CLAUDE.md). Events are queued to disk the
 * moment they are detected and drained in order once the link is up, so a fall seen during a
 * network blip still reaches the family (QoS 1, at-least-once — the backend de-duplicates on
 * eventId). Persisted as labels only, never media (rule #1).
 */
class Outbox(private val file: File, maxSize: Int = 500) {
    private val json = Json { ignoreUnknownKeys = true }
    private val buffer = OutboxBuffer(maxSize)

    init {
        load()
    }

    @Synchronized
    fun add(eventJson: String) {
        buffer.add(eventJson)
        save()
    }

    @Synchronized
    fun remove(id: Long) {
        buffer.remove(id)
        save()
    }

    @Synchronized
    fun snapshot(): List<OutboxItem> = buffer.snapshot()

    @Synchronized
    fun size(): Int = buffer.size

    /** Drop all queued events and remove the file — used by a remote wipe (F2.6). */
    @Synchronized
    fun clear() {
        buffer.restore(OutboxState())
        runCatching { if (file.exists()) file.delete() }
    }

    private fun load() {
        if (!file.exists()) return
        runCatching {
            buffer.restore(json.decodeFromString(OutboxState.serializer(), file.readText()))
        }.onFailure { Log.w(TAG, "outbox load failed; starting empty: ${it.message}") }
    }

    private fun save() {
        runCatching { file.writeText(json.encodeToString(OutboxState.serializer(), buffer.state())) }
            .onFailure { Log.w(TAG, "outbox save failed: ${it.message}") }
    }

    private companion object {
        const val TAG = "Outbox"
    }
}
