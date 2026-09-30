package com.watchdogindex.agent.core.repo

import com.watchdogindex.agent.core.api.FakeServer
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.api.PropertyApi
import com.watchdogindex.agent.core.api.PropertyFixture
import com.watchdogindex.agent.core.api.TestConfig
import com.watchdogindex.agent.core.model.ScanInput
import com.watchdogindex.agent.core.sample.InMemoryKeyValueStore
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The scan result's saved flag: one `saved_properties` lookup per resolve, one `in.(...)` lookup per history read. */
class LiveScanRepositoryTest {

    private val pin = PropertyFixture.PIN

    private fun server(savedPins: Set<String>, savedFails: Boolean = false): FakeServer {
        val server = FakeServer()
        server.on(HttpMethod.Get, PropertyApi.PROPERTY_PATH) { req ->
            if (req.param("pin") == pin) json(PropertyFixture.json) else json("""{"error":"Unknown property."}""", HttpStatusCode.BadRequest)
        }
        server.on(HttpMethod.Get, "/rest/v1/saved_properties") { req ->
            if (savedFails) return@on json("""{"message":"boom"}""", HttpStatusCode.InternalServerError)
            val filter = req.param("pams_pin").orEmpty()
            val asked = when {
                filter.startsWith("eq.") -> listOf(filter.removePrefix("eq."))
                filter.startsWith("in.(") -> filter.removePrefix("in.(").removeSuffix(")").split(',').map { it.trim('"') }
                else -> emptyList()
            }
            val rows = asked.filter { it in savedPins && req.param("kind") == "eq.watch" }
            json(rows.joinToString(",", "[", "]") { """{"pams_pin":"$it"}""" })
        }
        return server
    }

    @Test
    fun `a resolved scan says whether the home is already saved`() = runBlocking {
        val savedServer = server(setOf(pin))
        val saved = TestConfig.liveSet(savedServer)
        val result = saved.scan.resolve(ScanInput.ListingUrl("https://www.watchdogindex.com/nj/harrison-town/102-grant-ave/$pin"))
        assertEquals(pin, result.property.pin)
        assertTrue(result.isSaved)
        val lookup = savedServer.requestsTo("/rest/v1/saved_properties").single()
        assertEquals("eq.$pin", lookup.param("pams_pin"))
        assertEquals("eq.watch", lookup.param("kind"), "only the watch row is the saved home the bookmark controls")

        val unsaved = TestConfig.liveSet(server(emptySet()))
        assertFalse(unsaved.scan.resolve(ScanInput.QrCode(pin, null, null)).isSaved)
    }

    @Test
    fun `a failed saved lookup leaves the scan unsaved rather than failing it`() = runBlocking {
        val set = TestConfig.liveSet(server(setOf(pin), savedFails = true))
        val result = set.scan.resolve(ScanInput.QrCode(pin, null, null))
        assertEquals(pin, result.property.pin)
        assertFalse(result.isSaved)
    }

    @Test
    fun `history refreshes the saved flags in one request`() = runBlocking {
        val store = InMemoryKeyValueStore()
        val first = TestConfig.liveSet(server(emptySet()), store = store)
        assertFalse(first.scan.resolve(ScanInput.QrCode(pin, null, null)).isSaved)
        assertFalse(first.scan.history().single().result.isSaved)

        // Saved after the scan: the history read asks once for every stored pin and reports the home as saved now.
        val laterServer = server(setOf(pin))
        val later = TestConfig.liveSet(laterServer, store = store)
        val history = later.scan.history()
        assertEquals(listOf(pin), history.map { it.result.property.pin })
        assertTrue(history.single().result.isSaved)
        val lookup = laterServer.requestsTo("/rest/v1/saved_properties").single()
        assertEquals("in.(\"$pin\")", lookup.param("pams_pin"))
        assertEquals("eq.watch", lookup.param("kind"))

        // A lookup that fails keeps the stored flag instead of losing the history.
        val failing = TestConfig.liveSet(server(setOf(pin), savedFails = true), store = store)
        assertFalse(failing.scan.history().single().result.isSaved)
    }
}
