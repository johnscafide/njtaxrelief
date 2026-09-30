package com.watchdogindex.agent.voice

import com.watchdogindex.agent.voice.VoiceRecognition.Outcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pure part of Watchdog Intelligence Voice on Android: what the recognizer reports becomes a question or one sentence. */
class VoiceRecognitionTest {
    @Test
    fun `final results win and the best line is the first non-blank hypothesis`() {
        assertEquals(
            Outcome.Transcript("What changed in Red Bank this week"),
            VoiceRecognition.onResults(listOf("  ", "What changed in Red Bank this week ", "what changed in red bank"), lastPartial = "What changed in"),
        )
        assertEquals("What changed", VoiceRecognition.bestOf(listOf("", "What changed")))
        assertNull(VoiceRecognition.bestOf(null))
        assertNull(VoiceRecognition.bestOf(listOf(" ")))
    }

    @Test
    fun `an empty final bundle falls back to the last partial then to nothing heard`() {
        assertEquals(Outcome.Transcript("Is 36 Birchwood over-assessed"), VoiceRecognition.onResults(emptyList(), "Is 36 Birchwood over-assessed"))
        assertEquals(Outcome.Transcript("Is 36 Birchwood over-assessed"), VoiceRecognition.onResults(null, " Is 36 Birchwood over-assessed "))
        assertEquals(Outcome.Ended(VoiceRecognition.NOTHING_HEARD_MESSAGE), VoiceRecognition.onResults(null, null))
        assertEquals(Outcome.Ended(VoiceRecognition.NOTHING_HEARD_MESSAGE), VoiceRecognition.onResults(listOf(""), "  "))
    }

    @Test
    fun `no match and speech timeout after a partial still deliver the question`() {
        assertEquals(Outcome.Transcript("Which clients have appeals due"), VoiceRecognition.onError(VoiceRecognition.ERROR_NO_MATCH, "Which clients have appeals due"))
        assertEquals(Outcome.Transcript("Which clients have appeals due"), VoiceRecognition.onError(VoiceRecognition.ERROR_SPEECH_TIMEOUT, "Which clients have appeals due "))
        assertEquals(Outcome.Ended(VoiceRecognition.NOT_UNDERSTOOD_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_NO_MATCH, null))
        assertEquals(Outcome.Ended(VoiceRecognition.NOTHING_HEARD_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_SPEECH_TIMEOUT, " "))
    }

    @Test
    fun `other errors end with their sentence even when something was heard`() {
        assertEquals(Outcome.Ended(VoiceRecognition.CONNECTION_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_NETWORK, "half a question"))
        assertEquals(Outcome.Ended(VoiceRecognition.CONNECTION_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_SERVER_DISCONNECTED, null))
        assertEquals(Outcome.Ended(VoiceRecognition.PERMISSION_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_INSUFFICIENT_PERMISSIONS, null))
        assertEquals(Outcome.Ended(VoiceRecognition.MICROPHONE_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_AUDIO, null))
        assertEquals(Outcome.Ended(VoiceRecognition.BUSY_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_RECOGNIZER_BUSY, null))
        assertEquals(Outcome.Ended(VoiceRecognition.BUSY_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_TOO_MANY_REQUESTS, null))
        assertEquals(Outcome.Ended(VoiceRecognition.LANGUAGE_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_LANGUAGE_UNAVAILABLE, null))
        assertEquals(Outcome.Ended(VoiceRecognition.STOPPED_MESSAGE), VoiceRecognition.onError(VoiceRecognition.ERROR_CLIENT, null))
        assertEquals(Outcome.Ended(VoiceRecognition.NOT_LISTENING_MESSAGE), VoiceRecognition.onError(99, null))
    }

    @Test
    fun `every SpeechRecognizer error code reads as one plain sentence that offers typing`() {
        for (code in 0..16) {
            val message = VoiceRecognition.messageFor(code)
            assertTrue("code $code has a message", message.isNotBlank())
            assertTrue("code $code ends as a sentence: $message", message.endsWith("."))
            assertTrue("code $code offers typing instead: $message", message.contains("type", ignoreCase = true))
        }
    }

    @Test
    fun `the error constants are SpeechRecognizer's public values`() {
        // android.speech.SpeechRecognizer: ERROR_NETWORK_TIMEOUT = 1 through ERROR_CANNOT_LISTEN_TO_DOWNLOAD_EVENTS = 15.
        assertEquals(
            (1..15).toList(),
            listOf(
                VoiceRecognition.ERROR_NETWORK_TIMEOUT, VoiceRecognition.ERROR_NETWORK, VoiceRecognition.ERROR_AUDIO,
                VoiceRecognition.ERROR_SERVER, VoiceRecognition.ERROR_CLIENT, VoiceRecognition.ERROR_SPEECH_TIMEOUT,
                VoiceRecognition.ERROR_NO_MATCH, VoiceRecognition.ERROR_RECOGNIZER_BUSY, VoiceRecognition.ERROR_INSUFFICIENT_PERMISSIONS,
                VoiceRecognition.ERROR_TOO_MANY_REQUESTS, VoiceRecognition.ERROR_SERVER_DISCONNECTED, VoiceRecognition.ERROR_LANGUAGE_NOT_SUPPORTED,
                VoiceRecognition.ERROR_LANGUAGE_UNAVAILABLE, VoiceRecognition.ERROR_CANNOT_CHECK_SUPPORT, VoiceRecognition.ERROR_CANNOT_LISTEN_TO_DOWNLOAD_EVENTS,
            ),
        )
    }

    @Test
    fun `messages keep the brand and the typographic apostrophe`() {
        assertEquals(9, VoiceRecognition.messages.toSet().size)
        for (message in VoiceRecognition.messages) {
            assertFalse("no ASCII apostrophe in \"$message\"", message.contains('\''))
            assertFalse("never a standalone Intel in \"$message\"", Regex("\\bIntel\\b").containsMatchIn(message))
            assertFalse("never ROBUST Score in \"$message\"", message.contains("ROBUST Score"))
            if (message.contains("Voice")) assertTrue("Voice keeps the master name in \"$message\"", message.contains("Watchdog Intelligence Voice"))
        }
    }
}
