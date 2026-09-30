package com.watchdogindex.agent.core.repo

import com.watchdogindex.agent.core.api.FakeServer
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.api.TestConfig
import io.ktor.http.HttpMethod
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Saved and watched against the fake backend: saved is the `watch` row, watched is that row plus an unpaused preference. */
class LivePropertyRepositoryTest {

    private val watchPin = "0904_9_20" // saved with kind watch, preference row not paused: saved and watched
    private val homePin = "0904_9_21" // only a claimed `home` row: neither saved nor watched
    private val unsavedPin = "0904_9_22" // a preference row but no saved row: not watched
    private val pausedPin = "0904_9_23" // saved, preference row paused: saved, not watched

    private fun server(): FakeServer {
        val server = FakeServer()
        server.on(HttpMethod.Get, "/rest/v1/saved_properties") { req ->
            val pin = req.param("pams_pin")!!.removePrefix("eq.")
            val kind = req.param("kind")
            json(when (pin) {
                watchPin, pausedPin -> if (kind == null || kind == "eq.watch") """[{"pams_pin":"$pin"}]""" else "[]"
                homePin -> if (kind == null || kind == "eq.home") """[{"pams_pin":"$pin"}]""" else "[]"
                else -> "[]"
            })
        }
        server.on(HttpMethod.Get, "/rest/v1/property_alert_preferences") { req ->
            val pin = req.param("pams_pin")!!.removePrefix("eq.")
            json(when (pin) {
                watchPin, homePin, unsavedPin -> """[{"paused":false}]"""
                pausedPin -> """[{"paused":true}]"""
                else -> "[]"
            })
        }
        return server
    }

    @Test
    fun `saved means a watch row, the one setSaved controls`() = runBlocking {
        val server = server()
        val set = TestConfig.liveSet(server)
        assertTrue(set.properties.isSaved(watchPin))
        val query = server.requestsTo("/rest/v1/saved_properties").last()
        assertEquals("eq.$watchPin", query.param("pams_pin"))
        assertEquals("eq.watch", query.param("kind"), "a claimed home row is not what the Save switch controls")
        assertFalse(set.properties.isSaved(homePin))
        assertFalse(set.properties.isSaved(unsavedPin))
    }

    @Test
    fun `watched needs the saved row and a preference row that is not paused`() = runBlocking {
        val server = server()
        val set = TestConfig.liveSet(server)
        assertTrue(set.properties.isWatched(watchPin))
        assertFalse(set.properties.isWatched(pausedPin), "paused is not watched")
        assertFalse(set.properties.isWatched(unsavedPin), "a preference row for an unsaved home produces no events, so it is not a watch")
        assertTrue(server.requestsTo("/rest/v1/property_alert_preferences").none { it.param("pams_pin") == "eq.$unsavedPin" }, "the preference row is not even read for an unsaved home")
        assertFalse(set.properties.isWatched(homePin))
    }
}
