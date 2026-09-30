package com.watchdogindex.agent.android

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.watchdogindex.agent.ui.screens.intelligence.NoVoiceSession
import com.watchdogindex.agent.ui.screens.intelligence.VoiceSession
import com.watchdogindex.agent.voice.VoiceRecognition
import java.util.Locale

/**
 * Watchdog Intelligence Voice on Android: [VoiceSession] over android.speech.SpeechRecognizer. One instance per
 * MainActivity (it needs the activity's result registry for the RECORD_AUDIO prompt), provided to the shared UI
 * through LocalVoiceSession at the root; [release] runs from onDestroy.
 *
 * [available] is the platform's own answer (isRecognitionAvailable: a recognition service is installed and visible
 * to the app, see the `<queries>` entry in the manifest), so a phone without one keeps NoVoiceSession's honest
 * message instead of a mic that never hears. [start] asks for the microphone permission the first time, through the
 * activity's ActivityResultRegistry, and only then listens; a refusal ends the session with a plain sentence. Partial
 * results are kept so a recognizer that hears the question and then reports "no match" or a speech timeout still
 * delivers it ([VoiceRecognition] decides). [stop] cancels: nothing is asked, and the onFinished passed to start runs
 * with null. Everything runs on the main thread, where SpeechRecognizer requires it and where the composer's tap,
 * the permission result and the recognizer's callbacks all arrive.
 */
class AndroidVoiceSession(activity: ComponentActivity) : VoiceSession {
    private val app: Context = activity.applicationContext
    private val permissionLauncher: ActivityResultLauncher<String> = activity.activityResultRegistry.register(
        PERMISSION_KEY,
        ActivityResultContracts.RequestPermission(),
    ) { granted -> onPermissionResult(granted) }

    /** The session that is listening or waiting for the permission dialog; null between questions. */
    private var current: Listening? = null

    override val available: Boolean
        get() = SpeechRecognizer.isRecognitionAvailable(app)

    override fun start(onTranscript: (String) -> Unit, onFinished: (error: String?) -> Unit) {
        // A second start replaces the first, whose onFinished runs with null.
        cancelCurrent()
        val session = Listening(onTranscript, onFinished)
        if (!available) {
            session.deliver(VoiceRecognition.Outcome.Ended(NoVoiceSession.UNAVAILABLE_MESSAGE))
            return
        }
        current = session
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            listen(session)
        } else {
            session.awaitingPermission = true
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    override fun stop() {
        cancelCurrent()
    }

    /** From MainActivity.onDestroy: ends a session still running and frees the result registration. */
    fun release() {
        cancelCurrent()
        permissionLauncher.unregister()
    }

    private fun onPermissionResult(granted: Boolean) {
        // A result delivered after the activity was recreated finds no waiting session (the old one ended with the
        // old activity); the agent taps the mic again and, the permission now granted, listening starts at once.
        val session = current?.takeIf { it.awaitingPermission } ?: return
        session.awaitingPermission = false
        if (granted) listen(session) else session.deliver(VoiceRecognition.Outcome.Ended(VoiceRecognition.PERMISSION_MESSAGE))
    }

    private fun listen(session: Listening) {
        val recognizer = try {
            SpeechRecognizer.createSpeechRecognizer(app)
        } catch (e: RuntimeException) {
            null
        }
        if (recognizer == null) {
            session.deliver(VoiceRecognition.Outcome.Ended(VoiceRecognition.NOT_LISTENING_MESSAGE))
            return
        }
        session.recognizer = recognizer
        recognizer.setRecognitionListener(session)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, app.packageName)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, MAX_RESULTS)
        }
        try {
            recognizer.startListening(intent)
        } catch (e: RuntimeException) {
            session.deliver(VoiceRecognition.Outcome.Ended(VoiceRecognition.NOT_LISTENING_MESSAGE))
        }
    }

    private fun cancelCurrent() {
        val session = current ?: return
        session.recognizer?.cancel()
        session.deliver(VoiceRecognition.Outcome.Ended(null))
    }

    /** One question: the recognizer, the screen's callbacks and the last partial result, delivered exactly once. */
    private inner class Listening(
        private val onTranscript: (String) -> Unit,
        private val onFinished: (String?) -> Unit,
    ) : RecognitionListener {
        var recognizer: SpeechRecognizer? = null
        var awaitingPermission: Boolean = false
        private var lastPartial: String? = null
        private var delivered = false

        fun deliver(outcome: VoiceRecognition.Outcome) {
            if (delivered) return
            delivered = true
            recognizer?.destroy()
            recognizer = null
            if (current === this) current = null
            when (outcome) {
                is VoiceRecognition.Outcome.Transcript -> {
                    onTranscript(outcome.text)
                    onFinished(null)
                }
                is VoiceRecognition.Outcome.Ended -> onFinished(outcome.message)
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            VoiceRecognition.bestOf(partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))?.let { lastPartial = it }
        }

        override fun onResults(results: Bundle?) {
            deliver(VoiceRecognition.onResults(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), lastPartial))
        }

        override fun onError(error: Int) {
            deliver(VoiceRecognition.onError(error, lastPartial))
        }

        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private companion object {
        const val PERMISSION_KEY = "com.watchdogindex.agent.record_audio"
        const val MAX_RESULTS = 3
    }
}
