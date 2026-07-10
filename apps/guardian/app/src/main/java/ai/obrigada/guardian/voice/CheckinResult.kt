package ai.obrigada.guardian.voice

import java.util.Locale

/**
 * The result of a safety voice check-in and the pure logic that classifies it. The result
 * strings match the backend's VoiceCheckinResult subset a device can report. Classification
 * is deliberately conservative: distress words win over everything, and only genuinely empty
 * recognition reads as silence — a real answer must never be mistaken for no answer.
 */
object CheckinResult {
    const val I_AM_FINE = "i_am_fine"
    const val DISTRESS = "distress"
    const val SILENCE = "silence"

    /** Map recognized speech to a result: distress words win; any other speech is "fine". */
    fun classify(texts: List<String>, language: CheckinLanguage): String {
        val joined = texts.joinToString(" ").lowercase(Locale.ROOT).trim()
        if (joined.isEmpty()) return SILENCE
        if (language.distressKeywords.any { joined.contains(it) }) return DISTRESS
        return I_AM_FINE
    }
}
