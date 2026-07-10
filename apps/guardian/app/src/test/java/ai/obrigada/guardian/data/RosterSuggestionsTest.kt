package ai.obrigada.guardian.data

import org.junit.Assert.assertEquals
import org.junit.Test

class RosterSuggestionsTest {

    private fun entry(id: String, title: String) = RosterEntry(id = id, title = title, role = "family")

    @Test
    fun `offers everyone when nobody is enrolled yet`() {
        val roster = listOf(entry("1", "Grandfather"), entry("2", "Maria"))
        val pending = RosterSuggestions.pending(roster, emptyList())
        assertEquals(listOf("Grandfather", "Maria"), pending.map { it.title })
    }

    @Test
    fun `drops people already enrolled, ignoring case and whitespace`() {
        val roster = listOf(entry("1", "Grandfather"), entry("2", "Maria"), entry("3", "Nurse"))
        val pending = RosterSuggestions.pending(roster, listOf("  grandfather ", "MARIA"))
        assertEquals(listOf("Nurse"), pending.map { it.title })
    }

    @Test
    fun `returns empty when everyone is enrolled`() {
        val roster = listOf(entry("1", "Grandfather"))
        assertEquals(emptyList<RosterEntry>(), RosterSuggestions.pending(roster, listOf("Grandfather")))
    }

    @Test
    fun `handles an empty roster`() {
        assertEquals(emptyList<RosterEntry>(), RosterSuggestions.pending(emptyList(), listOf("Anyone")))
    }
}
