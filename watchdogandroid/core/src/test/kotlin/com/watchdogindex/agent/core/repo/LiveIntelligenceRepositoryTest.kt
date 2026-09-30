package com.watchdogindex.agent.core.repo

import com.watchdogindex.agent.core.api.FakeServer
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.api.TestConfig
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.minutes

/** The weekly brief on a Pro account with no saved brief: a failed analyst run is not repeated for an hour. */
class LiveIntelligenceRepositoryTest {

    private val success = """{"ok":true,"session_id":"s-1","status":"complete",
        "response":{"conclusion":"Two past clients have new tax bills this week; call Hamilton first.","cards":[],
                    "evidence":[{"text":"27 Hamilton St tax bill up ${'$'}612."}],"sources":[{"label":"NJ Division of Taxation"}]}}"""

    private fun server(): FakeServer {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/rest/v1/rpc/get_my_entitlement") { json("""[{"plan_tier":"pro","profession":"real_estate","subscription_status":"active","current_period_end":"2026-10-28T00:00:00Z","account_role":"user","billing_tier":"pro","property_capacity":100}]""") }
        server.on(HttpMethod.Post, "/rest/v1/rpc/has_watchdog_plan") { json("true") }
        server.on(HttpMethod.Post, "/rest/v1/rpc/get_agent_usage") { json("""{"plan":"pro","limits":{},"usage":{},"remaining":{}}""") }
        server.on(HttpMethod.Get, "/rest/v1/profiles") { json("""[{"id":"user-1","display_name":"Alex Moreno","full_name":"Alexandra Moreno","vanity_slug":"alex","pro_agent":null,"avatar_url":null}]""") }
        server.on(HttpMethod.Get, "/auth/v1/user") { json("""{"id":"user-1","email":"agent@example.com","user_metadata":{}}""") }
        server.on(HttpMethod.Get, "/rest/v1/intelligence_saved_briefs") { json("[]") }
        server.on(HttpMethod.Get, "/rest/v1/agent_farm_properties") { json("""[{"id":"f1","pams_pin":"0905_112_7","address":"27 HAMILTON ST","municipality":"HARRISON TOWN","relationship":"past_client"}]""") }
        server.on(HttpMethod.Get, "/rest/v1/saved_properties") { json("[]") }
        server.on(HttpMethod.Get, "/rest/v1/property_update_events") { json("[]") }
        server.on(HttpMethod.Post, "/rest/v1/rpc/marketing_studio_bootstrap") { json("""{"code":"P0001","message":"Marketing Studio requires Agent or higher"}""", HttpStatusCode.BadRequest) }
        return server
    }

    @Test
    fun `a failed analyst run is not retried for an hour, and a fresh run carries the real time`() = runBlocking {
        var now = TestConfig.now
        var analystStatus = HttpStatusCode.BadGateway
        val server = server()
        server.on(HttpMethod.Post, "/api/watchdog-intelligence-analyst") {
            if (analystStatus == HttpStatusCode.OK) json(success) else respond("<html>502 Bad Gateway</html>", analystStatus, headersOf(HttpHeaders.ContentType, "text/html"))
        }
        val set = TestConfig.liveSet(server) { now }
        fun runs() = server.requestsTo("/api/watchdog-intelligence-analyst").size

        val first = set.intelligence.brief()
        assertEquals(1, runs())
        assertEquals("Monday brief", first.kicker, "the digest fallback after a failed run")
        assertTrue(first.forLabel.contains("public-record changes"), first.forLabel)

        set.intelligence.brief()
        assertEquals(1, runs(), "no second run within the hour, even though the plan is eligible")

        now = TestConfig.now + 59.minutes
        set.intelligence.brief()
        assertEquals(1, runs(), "still inside the hour")

        now = TestConfig.now + 61.minutes
        analystStatus = HttpStatusCode.OK
        val brief = set.intelligence.brief()
        assertEquals(2, runs(), "the hour is over, so the analyst is asked again")
        assertEquals("Watchdog Intelligence brief", brief.kicker)
        assertTrue(brief.timeLabel.startsWith("11:01 AM"), "a fresh run is dated now (15:01Z is 11:01 AM in New Jersey), not 8:00 AM: ${brief.timeLabel}")
        assertEquals("Two past clients have new tax bills this week; call Hamilton first.", brief.items.first().lead)

        analystStatus = HttpStatusCode.BadGateway
        set.intelligence.brief()
        assertEquals(3, runs(), "a success clears the back-off, so the next visit may run again")
    }
}
