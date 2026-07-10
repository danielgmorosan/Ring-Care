package ai.obrigada.guardian.link

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The outbox is what keeps a fall from being lost during a network blip, so its FIFO order,
 * id assignment, and bounded cap are pinned. At-least-once is deliberate — the backend
 * de-duplicates on eventId — but events must never be silently reordered or exhausted.
 */
class OutboxBufferTest {

    @Test
    fun `items drain in the order they were added`() {
        val outbox = OutboxBuffer()
        outbox.add("a")
        outbox.add("b")
        outbox.add("c")
        assertEquals(listOf("a", "b", "c"), outbox.snapshot().map { it.json })
    }

    @Test
    fun `ids are unique and monotonic`() {
        val outbox = OutboxBuffer()
        val a = outbox.add("a")
        val b = outbox.add("b")
        assertTrue(b.id > a.id)
    }

    @Test
    fun `removing a delivered item leaves the rest in order`() {
        val outbox = OutboxBuffer()
        val a = outbox.add("a")
        outbox.add("b")
        outbox.remove(a.id)
        assertEquals(listOf("b"), outbox.snapshot().map { it.json })
    }

    @Test
    fun `the cap drops the oldest and reports how many`() {
        val outbox = OutboxBuffer(maxSize = 3)
        outbox.add("1")
        outbox.add("2")
        outbox.add("3")
        outbox.add("4") // pushes out "1"
        assertEquals(listOf("2", "3", "4"), outbox.snapshot().map { it.json })
        assertEquals(1L, outbox.droppedCount)
    }

    @Test
    fun `restore keeps the next id ahead of any existing item`() {
        val outbox = OutboxBuffer()
        outbox.restore(OutboxState(nextId = 2, items = listOf(OutboxItem(5, "x"))))
        val next = outbox.add("y")
        assertTrue("new id must not collide with restored ids", next.id > 5)
    }
}
