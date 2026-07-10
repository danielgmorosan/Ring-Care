package ai.obrigada.guardian.voice

import java.util.Locale

/**
 * The elder-facing check-in languages, each with the voice locale, the spoken prompt, and
 * the words that read as distress. This is a safety setting, not localization: the guardian
 * must speak the language the elder understands (set per household in the family app).
 *
 * European Portuguese (PT-PT), never Brazilian. English ships first.
 */
enum class CheckinLanguage(
    val code: String,
    val locale: Locale,
    val prompt: String,
    val distressKeywords: List<String>,
) {
    ENGLISH(
        code = "en",
        locale = Locale.forLanguageTag("en-GB"),
        prompt = "Hello. Are you okay? Do you need help?",
        distressKeywords =
            listOf("help", "not okay", "not ok", "hurt", "pain", "fallen", "can't", "emergency"),
    ),
    PORTUGUESE(
        code = "pt-PT",
        locale = Locale.forLanguageTag("pt-PT"),
        prompt = "Olá. Está tudo bem? Precisa de ajuda?",
        distressKeywords =
            listOf("ajuda", "socorro", "dor", "não consigo", "caí", "não estou bem", "emergência"),
    );

    companion object {
        /** Resolve a stored language code to a supported language, defaulting to English. */
        fun from(code: String?): CheckinLanguage =
            entries.firstOrNull { it.code.equals(code, ignoreCase = true) } ?: ENGLISH
    }
}
