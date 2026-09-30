package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.sample.InMemoryKeyValueStore
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AlertsApiTest {

    @Test
    fun `push registration sends the documented payload and heartbeats afterwards`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/functions/v1/push-device-register") { json("""{"ok":true,"registration":{"id":"reg-1","platform":"android"}}""", HttpStatusCode.Created) }
        server.on(HttpMethod.Get, "/rest/v1/agent_digest_preferences") { json("""[{"enabled":true,"weekday":1,"local_hour":8,"timezone":"America/New_York","last_sent_at":null}]""") }
        server.on(HttpMethod.Get, "/rest/v1/property_alert_preferences") { json("[]") }
        val store = InMemoryKeyValueStore()
        val set = TestConfig.liveSet(server, store)
        set.alerts.refresh()

        set.alerts.registerPushToken("fcm-token-1", "android")
        val first = server.requestsTo("/functions/v1/push-device-register").single().json()!!
        assertEquals("register", first.str("action"))
        assertEquals("android", first.str("platform"))
        assertEquals("fcm-token-1", first.str("token"))
        val installation = first.str("installation_id")!!
        assertTrue(installation.length in 8..128, installation)
        assertEquals("America/New_York", first.str("timezone"))
        assertEquals(21, first.int("quiet_hours_start"))
        assertEquals(7, first.int("quiet_hours_end"))
        assertEquals(true, first.bool("alerts_enabled"))
        assertEquals(true, first.bool("digest_enabled"))
        assertEquals("Bearer access-1", server.requestsTo("/functions/v1/push-device-register").single().headers["Authorization"])
        assertEquals("anon-key", server.requestsTo("/functions/v1/push-device-register").single().headers["apikey"])

        set.alerts.registerPushToken("fcm-token-2", "android")
        val second = server.requestsTo("/functions/v1/push-device-register")[1].json()!!
        assertEquals("heartbeat", second.str("action"))
        assertEquals(installation, second.str("installation_id"), "the installation id is stable per install")
        assertEquals("fcm-token-2", second.str("token"))

        set.alerts.unregisterPushToken("fcm-token-2")
        val third = server.requestsTo("/functions/v1/push-device-register")[2].json()!!
        assertEquals("unregister", third.str("action"))
        assertEquals(installation, third.str("installation_id"))
        assertNull(third.str("token"), "unregister carries only the installation id")
    }

    @Test
    fun `preference changes mirror to the push registration and fan out to the per-pin rows`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/functions/v1/push-device-register") { json("""{"ok":true}""") }
        server.on(HttpMethod.Get, "/rest/v1/agent_digest_preferences") { json("[]") }
        server.on(HttpMethod.Post, "/rest/v1/agent_digest_preferences") { json("[]") }
        // Only the saved pin has a preference row; the farm pin has none and must not get one from a category switch.
        server.on(HttpMethod.Get, "/rest/v1/property_alert_preferences") { json("""[{"pams_pin":"0409_285.14_9","alert_score":true,"alert_tax":true,"alert_assessment":true,"alert_deadline":true,"paused":false}]""") }
        server.on(HttpMethod.Patch, "/rest/v1/property_alert_preferences") { json("[]") }
        server.on(HttpMethod.Get, "/rest/v1/agent_farm_properties") { json("""[{"id":"f1","pams_pin":"0905_112_7","address":"27 HAMILTON ST","relationship":"past_client"}]""") }
        server.on(HttpMethod.Get, "/rest/v1/saved_properties") { json("""[{"pams_pin":"0409_285.14_9","address":"36 BIRCHWOOD DR","kind":"watch"}]""") }
        val set = TestConfig.liveSet(server)
        set.alerts.refresh()
        set.alerts.registerPushToken("fcm-token-1")
        assertEquals("Mondays at 8:00 AM", set.alerts.preferences.value.deliveryLabel, "no row means the sender's defaults")

        val current = set.alerts.preferences.value
        set.alerts.update(current.copy(mondayEmail = false, mondayNotification = false, channels = current.channels + (AlertChannel.AppealDeadlines to false)))

        val digestPost = server.requestsTo("/rest/v1/agent_digest_preferences").last { it.method == HttpMethod.Post }
        assertEquals("user_id", digestPost.param("on_conflict"))
        val digest = (WatchdogHttp.parseJsonOrNull(digestPost.body) as kotlinx.serialization.json.JsonArray).single() as kotlinx.serialization.json.JsonObject
        assertEquals(false, digest.bool("enabled"))
        assertEquals("user-1", digest.str("user_id"))
        val fanOut = server.requestsTo("/rest/v1/property_alert_preferences").last { it.method == HttpMethod.Patch }
        assertEquals("in.(0409_285.14_9)", fanOut.param("pams_pin"), "only the pin that already has a row is touched; the farm pin is not enrolled")
        assertEquals("eq.user-1", fanOut.param("user_id"))
        val patch = fanOut.json()!!
        assertEquals(false, patch.bool("alert_deadline"))
        assertEquals(true, patch.bool("alert_tax"))
        assertNull(patch["paused"], "a category switch never pauses a property")
        assertTrue(server.requestsTo("/rest/v1/property_alert_preferences").none { it.method == HttpMethod.Post }, "a category switch never upserts, so it cannot create rows")
        val mirror = server.requestsTo("/functions/v1/push-device-register").last().json()!!
        assertEquals("update", mirror.str("action"))
        assertEquals(false, mirror.bool("digest_enabled"))
        assertEquals(true, mirror.bool("alerts_enabled"))
    }

    @Test
    fun `a missing push function is a plain error, not a crash`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/functions/v1/push-device-register") { json("""{"code":404,"message":"Requested function was not found"}""", HttpStatusCode.NotFound) }
        val set = TestConfig.liveSet(server)
        val e = assertFailsWith<WatchdogException> { set.alerts.registerPushToken("tok") }
        assertNotEquals("", e.userMessage)
        assertTrue(e.userMessage.contains("Notifications"), e.userMessage)
    }
}
