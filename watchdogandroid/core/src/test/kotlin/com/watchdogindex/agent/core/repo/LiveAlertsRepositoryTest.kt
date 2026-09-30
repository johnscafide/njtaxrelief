package com.watchdogindex.agent.core.repo

import com.watchdogindex.agent.core.api.FakeServer
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.api.HttpFailureException
import com.watchdogindex.agent.core.api.LiveKeys
import com.watchdogindex.agent.core.api.StoredLocalAlerts
import com.watchdogindex.agent.core.api.TestConfig
import com.watchdogindex.agent.core.api.WatchdogHttp
import com.watchdogindex.agent.core.api.bool
import com.watchdogindex.agent.core.api.int
import com.watchdogindex.agent.core.api.liveJson
import com.watchdogindex.agent.core.api.str
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.QuietHours
import com.watchdogindex.agent.core.sample.InMemoryKeyValueStore
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
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

    private fun InMemoryKeyValueStore.localAlerts(): StoredLocalAlerts? = snapshot()[LiveKeys.LOCAL_ALERTS]?.let { liveJson.decodeFromString(StoredLocalAlerts.serializer(), it) }

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

    // ------------------------------------------------------------------ a save that fails is not remembered as saved

    @Test
    fun `when the Monday email row cannot be written nothing is kept on the device and the state does not move`() = runBlocking {
        val server = server(emptyList())
        server.on(HttpMethod.Post, "/rest/v1/agent_digest_preferences") { json("""{"message":"upstream timeout"}""", HttpStatusCode.BadGateway) }
        val store = InMemoryKeyValueStore()
        val set = TestConfig.liveSet(server, store)
        set.alerts.refresh()
        val before = set.alerts.preferences.value

        assertFailsWith<HttpFailureException> { set.alerts.update(before.copy(mondayEmail = false)) }
        assertEquals(before, set.alerts.preferences.value, "the state the screen reverts to is the truth")
        assertNull(store.localAlerts(), "nothing was written to the device before the server took the change")
        set.alerts.refresh()
        assertEquals(true, set.alerts.preferences.value.mondayEmail, "and the next load agrees, so the switch cannot jump")
    }

    @Test
    fun `when the per-pin patch fails the category switch stays off the device but the rest of the change is kept`() = runBlocking {
        val server = server(listOf("0001_1_1"))
        server.on(HttpMethod.Patch, "/rest/v1/property_alert_preferences") { json("""{"message":"upstream timeout"}""", HttpStatusCode.BadGateway) }
        val store = InMemoryKeyValueStore()
        val set = TestConfig.liveSet(server, store)
        set.alerts.refresh()
        val before = set.alerts.preferences.value

        assertFailsWith<HttpFailureException> {
            set.alerts.update(before.copy(quietHours = QuietHours(22, 6), channels = before.channels + (AlertChannel.ClientHomeChanges to false)))
        }
        val after = set.alerts.preferences.value
        assertEquals(true, after.channels[AlertChannel.ClientHomeChanges], "the rows did not change, so the switch the rows drive does not either")
        assertEquals(QuietHours(22, 6), after.quietHours, "what the server does not own is kept")
        val stored = store.localAlerts()!!
        assertEquals(true, stored.channelMap()[AlertChannel.ClientHomeChanges])
        assertEquals(22, stored.quietStartHour)
        set.alerts.refresh()
        assertEquals(after, set.alerts.preferences.value, "the device, the state and the next load all say the same thing")
    }

    @Test
    fun `a cancelled save stops where it is and never publishes or persists anything`() = runBlocking {
        val server = server(listOf("0001_1_1"))
        val patchStarted = CompletableDeferred<Unit>()
        server.on(HttpMethod.Patch, "/rest/v1/property_alert_preferences") { patchStarted.complete(Unit); awaitCancellation() }
        val store = InMemoryKeyValueStore()
        val set = TestConfig.liveSet(server, store)
        set.alerts.refresh()
        val before = set.alerts.preferences.value

        val job = launch { set.alerts.update(before.copy(channels = before.channels + (AlertChannel.AppealDeadlines to false))) }
        patchStarted.await()
        job.cancelAndJoin()
        assertTrue(job.isCancelled)
        assertEquals(before, set.alerts.preferences.value, "a swallowed cancellation would have published the switch")
        assertNull(store.localAlerts(), "and written it to the device")
    }

    // ------------------------------------------------------------------ push registration and the agent's saved switches

    @Test
    fun `the launch heartbeat carries no preference fields and the first registration carries the device's stored switches`() = runBlocking {
        val server = server(emptyList())
        server.on(HttpMethod.Post, "/functions/v1/push-device-register") { json("""{"ok":true}""") }
        // The agent switched the Monday notification and two channels off, and moved quiet hours, in an earlier session.
        val store = InMemoryKeyValueStore(mapOf(LiveKeys.LOCAL_ALERTS to liveJson.encodeToString(StoredLocalAlerts(
            mondayNotification = false,
            channels = mapOf(AlertChannel.ClientHomeChanges.id to false, AlertChannel.FarmSalesAndDeeds.id to false, AlertChannel.AppealDeadlines.id to false),
            quietStartHour = 22,
            quietEndHour = 6,
        ))))
        val set = TestConfig.liveSet(server, store)
        // No refresh(): this is the cold start, where Settings has not been opened and the state still holds the defaults.
        set.alerts.registerPushToken("fcm-token-1", "android")
        val first = server.requestsTo("/functions/v1/push-device-register").single().json()!!
        assertEquals("register", first.str("action"))
        assertEquals(false, first.bool("digest_enabled"), "the stored switch, not the default")
        assertEquals(false, first.bool("alerts_enabled"), "every channel is off on this device")
        assertEquals(22, first.int("quiet_hours_start"))
        assertEquals(6, first.int("quiet_hours_end"))

        set.alerts.registerPushToken("fcm-token-1", "android")
        val heartbeat = server.requestsTo("/functions/v1/push-device-register")[1].json()!!
        assertEquals("heartbeat", heartbeat.str("action"))
        assertEquals(first.str("installation_id"), heartbeat.str("installation_id"))
        assertEquals("fcm-token-1", heartbeat.str("token"))
        assertEquals("android", heartbeat.str("platform"))
        assertEquals(setOf("action", "installation_id", "token", "platform"), heartbeat.keys, "nothing the server could patch over the agent's saved values")
        assertFalse(server.requests.any { it.path.startsWith("/rest/v1/") }, "neither call needed a refresh round trip")
    }
}
