package com.watchdogindex.agent.ui.screens.intelligence

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Watchdog Intelligence Voice: the platform speech recognizer behind every mic on the Intelligence screen.
 * There is no shared platform API for speech yet, so the screen takes one through [LocalVoiceSession]: a host
 * provides a real implementation at its root (`CompositionLocalProvider(LocalVoiceSession provides …)` around
 * the app content; on Android a SpeechRecognizer-backed one), and every host without one keeps
 * [NoVoiceSession], whose message says plainly that Voice is not ready on this device rather than promising it
 * somewhere else. Candidate for promotion into `platform/PlatformServices` once the Android implementation lands.
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

/** Any host without a recognizer (the desktop, and the app until it provides one): never listens, and says so honestly. */
object NoVoiceSession : VoiceSession {
    const val UNAVAILABLE_MESSAGE = "Watchdog Intelligence Voice isn’t ready on this device yet. Type your question instead."

    /** What the mic is announced as while [available] is false, so the limit is known before the tap. */
    const val UNAVAILABLE_MIC_DESCRIPTION = "Watchdog Intelligence Voice, not ready on this device yet"

    override val available: Boolean = false

    override fun start(onTranscript: (String) -> Unit, onFinished: (error: String?) -> Unit) {
        onFinished(UNAVAILABLE_MESSAGE)
    }

    override fun stop() {}
}

/** The voice session for the Intelligence screen; [NoVoiceSession] unless the host provides a real one. */
val LocalVoiceSession = staticCompositionLocalOf<VoiceSession> { NoVoiceSession }
