package ai.obrigada.guardian.voice

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The check-in classifier decides whether a fall stands down or escalates, so its behavior
 * is pinned: distress words always win, an ordinary answer reads as "fine", and only truly
 * empty recognition is silence — a real answer must never be mistaken for no answer.
 */
class CheckinResultTest {

    @Test
    fun `empty recognition is silence`() {
        assertEquals(CheckinResult.SILENCE, CheckinResult.classify(emptyList(), CheckinLanguage.ENGLISH))
        assertEquals(CheckinResult.SILENCE, CheckinResult.classify(listOf("   "), CheckinLanguage.ENGLISH))
    }

    @Test
    fun `an ordinary answer reads as fine`() {
        assertEquals(
            CheckinResult.I_AM_FINE,
            CheckinResult.classify(listOf("yes I am fine thank you"), CheckinLanguage.ENGLISH),
        )
    }

    @Test
    fun `distress words escalate, even amid other words`() {
        assertEquals(
            CheckinResult.DISTRESS,
            CheckinResult.classify(listOf("please help me"), CheckinLanguage.ENGLISH),
        )
        assertEquals(
            CheckinResult.DISTRESS,
            CheckinResult.classify(listOf("I am in pain"), CheckinLanguage.ENGLISH),
        )
    }

    @Test
    fun `portuguese distress words are recognized in pt-PT`() {
        assertEquals(
            CheckinResult.DISTRESS,
            CheckinResult.classify(listOf("socorro por favor"), CheckinLanguage.PORTUGUESE),
        )
        assertEquals(
            CheckinResult.I_AM_FINE,
            CheckinResult.classify(listOf("estou bem obrigada"), CheckinLanguage.PORTUGUESE),
        )
    }

    @Test
    fun `classification is case-insensitive`() {
        assertEquals(
            CheckinResult.DISTRESS,
            CheckinResult.classify(listOf("HELP"), CheckinLanguage.ENGLISH),
        )
    }
}
