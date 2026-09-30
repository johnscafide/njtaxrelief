package com.watchdogindex.agent.core.repo

import com.watchdogindex.agent.core.api.FakeServer
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.api.TestConfig
import com.watchdogindex.agent.core.api.WatchdogHttp
import com.watchdogindex.agent.core.api.bool
import com.watchdogindex.agent.core.api.int
import com.watchdogindex.agent.core.api.str
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.QuietHours
import io.ktor.http.HttpMethod
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The Settings switches against the fake backend: a category switch only patches the `property_alert_preferences`
 * rows that already exist, and the Monday email row is written only when that switch changes.
 */
class LiveAlertsRepositoryTest {

    private fun preferenceRows(pins: List<String>) = pins.joinToString(",", "[", "]") {
        """{"pams_pin":"$it","alert_score":true,"alert_tax":true,"alert_assessment":true,"alert_deadline":true,"paused":false}"""
    }

    private fun server(preferencePins: List<String>): FakeServer {
        val server = FakeServer()
        server.on(HttpMethod.Get, "/rest/v1/agent_digest_preferences") { json("[]") }
        server.on(HttpMethod.Post, "/rest/v1/agent_digest_preferences") { json("[]") }
        server.on(HttpMethod.Get, "/rest/v1/property_alert_preferences") { json(preferenceRows(preferencePins)) }
        server.on(HttpMethod.Patch, "/rest/v1/property_alert_preferences") { json("[]") }
        server.on(HttpMethod.Post, "/rest/v1/property_alert_preferences") { json("[]") }
        // The sphere is much wider than the rows: farm and sphere pins that were never watched.
        server.on(HttpMethod.Get, "/rest/v1/agent_farm_properties") { json("""[{"id":"f1","pams_pin":"0905_112_7","address":"27 HAMILTON ST","relationship":"past_client"},{"id":"f2","pams_pin":"1340_44_3","address":"61 SPRING ST","relationship":"farm"}]""") }
        server.on(HttpMethod.Get, "/rest/v1/saved_properties") { json("""[{"pams_pin":"0409_285.14_9","address":"36 BIRCHWOOD DR","kind":"watch"}]""") }
        return server
    }

    private fun FakeServer.Recorded.inList(): List<String> = param("pams_pin")!!.removePrefix("in.(").removeSuffix(")").split(",")

    private fun FakeServer.digestWrites() = requestsTo("/rest/v1/agent_digest_preferences").count { it.method == HttpMethod.Post }

    private fun FakeServer.lastDigestRow(): JsonObject =
        (WatchdogHttp.parseJsonOrNull(requestsTo("/rest/v1/agent_digest_preferences").last { it.method == HttpMethod.Post }.body) as JsonArray).single() as JsonObject

    @Test
    fun `a category switch patches only the pins that already have a preference row, in chunks of 100`() = runBlocking {
        val watched = (1..150).map { "0001_1_$it" }
        val server = server(watched)
        val set = TestConfig.liveSet(server)
        set.alerts.refresh()
        val current = set.alerts.preferences.value
        set.alerts.update(current.copy(channels = current.channels + (AlertChannel.ClientHomeChanges to false)))

        val patches = server.requestsTo("/rest/v1/property_alert_preferences").filter { it.method == HttpMethod.Patch }
        assertEquals(listOf(100, 50), patches.map { it.inList().size }, "150 rows go out as 100 + 50")
        val touched = patches.flatMap { it.inList() }.toSet()
        assertEquals(watched.toSet(), touched)
        for (pin in listOf("0905_112_7", "1340_44_3", "0409_285.14_9")) assertTrue(pin !in touched, "$pin has no preference row and must not get one")
        for (patch in patches) {
            assertEquals("eq.user-1", patch.param("user_id"))
            val body = patch.json()!!
            assertEquals(false, body.bool("alert_tax"))
            assertEquals(false, body.bool("alert_assessment"))
            assertEquals(false, body.bool("alert_score"))
            assertEquals(true, body.bool("alert_deadline"), "the other switch is carried unchanged")
            assertNull(body["paused"], "a category switch never pauses a property")
            assertNull(body["pams_pin"], "a patch names the rows in the filter, not in the body")
        }
        assertTrue(server.requestsTo("/rest/v1/property_alert_preferences").none { it.method == HttpMethod.Post }, "never an upsert: a category switch cannot create rows")
    }

    @Test
    fun `with no preference rows a category switch writes nothing to the per-pin table`() = runBlocking {
        val server = server(emptyList())
        val set = TestConfig.liveSet(server)
        set.alerts.refresh()
        val current = set.alerts.preferences.value
        set.alerts.update(current.copy(channels = current.channels + (AlertChannel.AppealDeadlines to false)))
        assertTrue(server.requestsTo("/rest/v1/property_alert_preferences").none { it.method == HttpMethod.Patch || it.method == HttpMethod.Post })
        assertEquals(false, set.alerts.preferences.value.channels[AlertChannel.AppealDeadlines], "the switch itself is kept on the device")
    }

    @Test
    fun `the Monday email row is written only when that switch changes`() = runBlocking {
        val server = server(emptyList())
        val set = TestConfig.liveSet(server)
        set.alerts.refresh()
        val current = set.alerts.preferences.value
        assertTrue(current.mondayEmail, "no row means on")

        set.alerts.update(current.copy(channels = current.channels + (AlertChannel.AppealDeadlines to false)))
        assertEquals(0, server.digestWrites(), "a channel change on an account without a digest row does not create one")

        set.alerts.update(set.alerts.preferences.value.copy(mondayEmail = false))
        assertEquals(1, server.digestWrites())
        assertEquals(false, server.lastDigestRow().bool("enabled"))

        set.alerts.update(set.alerts.preferences.value.copy(quietHours = QuietHours(22, 6)))
        assertEquals(1, server.digestWrites(), "the switch did not change again, so the row is not rewritten")

        set.alerts.update(set.alerts.preferences.value.copy(mondayEmail = true))
        assertEquals(2, server.digestWrites())
        val again = server.lastDigestRow()
        assertEquals(true, again.bool("enabled"))
        assertEquals(1, again.int("weekday"), "after the first save the row is remembered, so its schedule travels with the next write")
        assertEquals(8, again.int("local_hour"))
        assertEquals("America/New_York", again.str("timezone"))
    }
}
