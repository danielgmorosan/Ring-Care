package ai.obrigada.guardian.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log

/**
 * The on-device safety voice check-in (F1.3). After a suspected fall the guardian asks, in
 * the household's language, whether the elder is okay, then listens for a short window and
 * classifies the answer. The result — one of the backend's VoiceCheckinResult values — is
 * returned to the caller, which emits it as a voice.checkin_result event.
 *
 * Everything happens on-device: the prompt is synthesized locally and the audio is
 * recognized locally; nothing but the resulting label leaves (CLAUDE.md rule #1). This
 * pipeline is deliberately separate from the "Hey Obrigada" assistant and does not depend
 * on it.
 */
class VoiceCheckin(
    private val context: Context,
    private val language: CheckinLanguage,
) {
    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var recognizer: SpeechRecognizer? = null
    private var finished = false
    private var onResult: ((String) -> Unit)? = null

    private val timeout = Runnable { finish(CheckinResult.SILENCE) }

    /** Speak the prompt, listen, and deliver exactly one result. Safe to call once. */
    fun run(onResult: (String) -> Unit) {
        this.onResult = onResult
        main.post { speak() }
    }

    /** Abort without delivering a result (used when the service is tearing down). */
    fun cancel() {
        if (finished) return
        finished = true
        main.removeCallbacks(timeout)
        cleanup()
    }

    private fun speak() {
        val engine =
            TextToSpeech(context) { status ->
                if (status != TextToSpeech.SUCCESS) {
                    Log.w(TAG, "TTS init failed; listening without a prompt")
                    main.post { listen() }
                    return@TextToSpeech
                }
                val t = tts ?: return@TextToSpeech
                val langResult = t.setLanguage(language.locale)
                if (langResult == TextToSpeech.LANG_MISSING_DATA ||
                    langResult == TextToSpeech.LANG_NOT_SUPPORTED
                ) {
                    Log.w(TAG, "TTS voice for ${language.code} unavailable; using default voice")
                }
                t.setOnUtteranceProgressListener(
                    object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) = Unit

                        override fun onDone(utteranceId: String?) {
                            main.post { listen() }
                        }

                        @Suppress("DEPRECATION")
                        override fun onError(utteranceId: String?) {
                            main.post { listen() }
                        }
                    },
                )
                t.speak(language.prompt, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
            }
        tts = engine
    }

    private fun listen() {
        if (finished) return
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.w(TAG, "speech recognition unavailable on this device; recording silence")
            finish(CheckinResult.SILENCE)
            return
        }
        val sr = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = sr
        sr.setRecognitionListener(
            object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val texts =
                        results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
                    finish(CheckinResult.classify(texts, language))
                }

                override fun onError(error: Int) = finish(CheckinResult.SILENCE)

                override fun onReadyForSpeech(params: Bundle?) = Unit

                override fun onBeginningOfSpeech() = Unit

                override fun onRmsChanged(rmsdB: Float) = Unit

                override fun onBufferReceived(buffer: ByteArray?) = Unit

                override fun onEndOfSpeech() = Unit

                override fun onPartialResults(partialResults: Bundle?) = Unit

                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            },
        )
        val intent =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                )
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language.locale.toLanguageTag())
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            }
        try {
            sr.startListening(intent)
            // If the recognizer never calls back (some devices go quiet), treat as silence.
            main.postDelayed(timeout, LISTEN_TIMEOUT_MS)
        } catch (e: Exception) {
            Log.w(TAG, "startListening failed: ${e.message}")
            finish(CheckinResult.SILENCE)
        }
    }

    private fun finish(result: String) {
        if (finished) return
        finished = true
        main.removeCallbacks(timeout)
        cleanup()
        onResult?.invoke(result)
    }

    private fun cleanup() {
        try {
            recognizer?.destroy()
        } catch (e: Exception) {
            Log.w(TAG, "recognizer cleanup failed: ${e.message}")
        }
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (e: Exception) {
            Log.w(TAG, "tts cleanup failed: ${e.message}")
        }
        recognizer = null
        tts = null
    }

    private companion object {
        const val TAG = "VoiceCheckin"
        const val UTTERANCE_ID = "checkin_prompt"
        const val LISTEN_TIMEOUT_MS = 12_000L
    }
}
