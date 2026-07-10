package ai.obrigada.guardian.data

import kotlinx.serialization.Serializable

/**
 * One household roster entry as the backend serves it to the guardian (F2.2). Labels only —
 * the caregiver already typed the title in the family app; the face itself is captured and
 * kept on this phone (CLAUDE.md rules #1/#4). `id` is the roster person id, kept so the
 * on-device gallery can line up with the family's roster.
 */
@Serializable
data class RosterEntry(
    val id: String,
    val title: String,
    val role: String = "",
)

/** Pure helper: which roster people are not yet enrolled on this device, so enrollment can
 * suggest the ones still to do. Case- and whitespace-insensitive on the display name. */
object RosterSuggestions {
    fun pending(roster: List<RosterEntry>, enrolledNames: List<String>): List<RosterEntry> {
        val taken = enrolledNames.map { it.trim().lowercase() }.toSet()
        return roster.filter { it.title.trim().lowercase() !in taken }
    }
}
