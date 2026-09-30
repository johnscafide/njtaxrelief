package com.watchdogindex.agent.ui.screens.intelligence

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Watchdog Intelligence Voice: the platform speech recognizer behind every mic on the Intelligence screen.
 * There is no shared platform API for speech yet, so the screen takes one through [LocalVoiceSession]: the
 * Android app can provide a SpeechRecognizer-backed implementation at its root, and the desktop keeps
 * [NoVoiceSession], which only says that voice is for the phone. Candidate for promotion into
 * `platform/PlatformServices` once the Android implementation lands.
 */
interface VoiceSession {
    /** False when this platform cannot listen; the screen then explains instead of starting. */
    val available: Boolean

    /**
     * Starts listening. [onTranscript] receives the recognised question once it is final; [onFinished] runs when
     * listening ends for any reason, with a user-facing message when it ended in an error and null otherwise.
     */
    fun start(onTranscript: (String) -> Unit, onFinished: (error: String?) -> Unit)

    /** Stops listening early. The [onFinished] passed to [start] still runs. */
    fun stop()
}

/** The desktop (and any host without a recognizer): never listens, always says voice is available on the phone. */
object NoVoiceSession : VoiceSession {
    const val UNAVAILABLE_MESSAGE = "Voice is available on your phone"

    override val available: Boolean = false

    override fun start(onTranscript: (String) -> Unit, onFinished: (error: String?) -> Unit) {
        onFinished(UNAVAILABLE_MESSAGE)
    }

    override fun stop() {}
}

/** The voice session for the Intelligence screen; [NoVoiceSession] unless the host provides a real one. */
val LocalVoiceSession = staticCompositionLocalOf<VoiceSession> { NoVoiceSession }
