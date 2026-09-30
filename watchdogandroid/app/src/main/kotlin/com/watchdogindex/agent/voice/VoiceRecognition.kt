package com.watchdogindex.agent.voice

/**
 * The pure half of Watchdog Intelligence Voice on Android. AndroidVoiceSession drives android.speech.SpeechRecognizer
 * and hands what it reports here (an error code, the final results, the last partial result heard before either)
 * to be turned into what the shared VoiceSession contract gives the screen: the recognised question, or one plain
 * sentence saying why listening ended without one. No android.* imports, so the mapping is unit-tested on the JVM
 * (VoiceRecognitionTest); the error constants are SpeechRecognizer's own public values, which the caller passes
 * through unchanged.
 */
object VoiceRecognition {
    // android.speech.SpeechRecognizer.ERROR_* (public API constants: 1 to 9 since API 8, 10 and 11 since API 31,
    // 12 to 15 since API 33). VoiceRecognitionTest pins the values.
    const val ERROR_NETWORK_TIMEOUT = 1
    const val ERROR_NETWORK = 2
    const val ERROR_AUDIO = 3
    const val ERROR_SERVER = 4
    const val ERROR_CLIENT = 5
    const val ERROR_SPEECH_TIMEOUT = 6
    const val ERROR_NO_MATCH = 7
    const val ERROR_RECOGNIZER_BUSY = 8
    const val ERROR_INSUFFICIENT_PERMISSIONS = 9
    const val ERROR_TOO_MANY_REQUESTS = 10
    const val ERROR_SERVER_DISCONNECTED = 11
    const val ERROR_LANGUAGE_NOT_SUPPORTED = 12
    const val ERROR_LANGUAGE_UNAVAILABLE = 13
    const val ERROR_CANNOT_CHECK_SUPPORT = 14
    const val ERROR_CANNOT_LISTEN_TO_DOWNLOAD_EVENTS = 15

    /** The microphone permission was refused, in the system dialog or earlier. */
    const val PERMISSION_MESSAGE =
        "Watchdog needs microphone access for Watchdog Intelligence Voice. Allow it in your phone’s settings, or type your question."
    const val NOTHING_HEARD_MESSAGE = "Watchdog Intelligence Voice didn’t hear a question. Tap the mic and try again, or type it."
    const val NOT_UNDERSTOOD_MESSAGE = "Watchdog Intelligence Voice didn’t catch that. Try again, or type your question."
    const val MICROPHONE_MESSAGE = "The microphone isn’t available right now. Type your question instead."
    const val CONNECTION_MESSAGE =
        "Watchdog Intelligence Voice needs a connection right now. Check your network, or type your question."
    const val BUSY_MESSAGE = "Speech recognition is busy on this phone. Try again in a moment, or type your question."
    const val LANGUAGE_MESSAGE =
        "Watchdog Intelligence Voice doesn’t support your phone’s language yet. Type your question instead."
    const val STOPPED_MESSAGE = "Watchdog Intelligence Voice stopped before it finished. Try again, or type your question."
    /** The recognizer could not be started at all (the platform threw, or an error code this build does not know). */
    const val NOT_LISTENING_MESSAGE = "Watchdog Intelligence Voice couldn’t start listening. Try again, or type your question."

    /** Every sentence the screen may show, for the brand and typography checks in the test. */
    val messages: List<String> = listOf(
        PERMISSION_MESSAGE, NOTHING_HEARD_MESSAGE, NOT_UNDERSTOOD_MESSAGE, MICROPHONE_MESSAGE, CONNECTION_MESSAGE,
        BUSY_MESSAGE, LANGUAGE_MESSAGE, STOPPED_MESSAGE, NOT_LISTENING_MESSAGE,
    )

    /** How one listening session ends: a question to ask, or a message (null when the agent stopped it). */
    sealed interface Outcome {
        data class Transcript(val text: String) : Outcome
        data class Ended(val message: String?) : Outcome
    }

    /** The best line of a results bundle: the first non-blank hypothesis (the recognizer orders them by confidence), trimmed. */
    fun bestOf(results: List<String>?): String? = results?.firstNotNullOfOrNull { line -> line.trim().takeIf { it.isNotEmpty() } }

    /**
     * Final results. The best hypothesis wins; when the final bundle comes back empty (some recognizers do that
     * after sending partials) the last partial is the question; with neither, nothing was heard.
     */
    fun onResults(results: List<String>?, lastPartial: String?): Outcome {
        val text = bestOf(results) ?: lastPartial?.trim()?.takeIf { it.isNotEmpty() }
        return if (text != null) Outcome.Transcript(text) else Outcome.Ended(NOTHING_HEARD_MESSAGE)
    }

    /**
     * An error code. "No match" and a speech timeout after a partial was heard mean the recognizer stopped hearing
     * speech, so the partial is the question; any other error, heard or not, ends with its sentence, because a
     * question cut off by a dropped connection should not be asked as if it were complete.
     */
    fun onError(code: Int, lastPartial: String?): Outcome {
        val heard = lastPartial?.trim()?.takeIf { it.isNotEmpty() }
        if (heard != null && (code == ERROR_NO_MATCH || code == ERROR_SPEECH_TIMEOUT)) return Outcome.Transcript(heard)
        return Outcome.Ended(messageFor(code))
    }

    /** One plain sentence per SpeechRecognizer error code; every one offers typing instead. */
    fun messageFor(code: Int): String = when (code) {
        ERROR_SPEECH_TIMEOUT -> NOTHING_HEARD_MESSAGE
        ERROR_NO_MATCH -> NOT_UNDERSTOOD_MESSAGE
        ERROR_AUDIO -> MICROPHONE_MESSAGE
        ERROR_INSUFFICIENT_PERMISSIONS -> PERMISSION_MESSAGE
        ERROR_NETWORK, ERROR_NETWORK_TIMEOUT, ERROR_SERVER, ERROR_SERVER_DISCONNECTED -> CONNECTION_MESSAGE
        ERROR_RECOGNIZER_BUSY, ERROR_TOO_MANY_REQUESTS -> BUSY_MESSAGE
        ERROR_LANGUAGE_NOT_SUPPORTED, ERROR_LANGUAGE_UNAVAILABLE -> LANGUAGE_MESSAGE
        ERROR_CLIENT -> STOPPED_MESSAGE
        else -> NOT_LISTENING_MESSAGE
    }
}
