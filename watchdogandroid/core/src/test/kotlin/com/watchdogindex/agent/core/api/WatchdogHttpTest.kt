package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.NetworkException
import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import io.ktor.client.engine.mock.MockEngine
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WatchdogHttpTest {

    @Test
    fun `a 401 with a user token is retried once after a refresh`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Get, "/rest/v1/agent_farm_properties") { req ->
            if (req.headers["Authorization"] == "Bearer new-token") json("[]") else json("""{"message":"JWT expired","code":"PGRST301"}""", HttpStatusCode.Unauthorized)
        }
        var refreshes = 0
        val client = TestConfig.client(server, TokenProvider { "old-token" }, TokenRefresher { stale -> refreshes += 1; assertEquals("old-token", stale); "new-token" })
        val rest = SupabaseRest(client, TestConfig.config)
        val rows = rest.select("agent_farm_properties", "id")
        assertEquals(0, rows.size)
        assertEquals(1, refreshes)
        val calls = server.requestsTo("/rest/v1/agent_farm_properties")
        assertEquals(2, calls.size)
        assertEquals("Bearer old-token", calls[0].headers["Authorization"])
        assertEquals("Bearer new-token", calls[1].headers["Authorization"])
        assertEquals("anon-key", calls[1].headers["apikey"])
    }

    @Test
    fun `a 401 that survives the refresh is not retried twice and surfaces as not signed in`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Get, "/rest/v1/thing") { json("""{"message":"JWT expired"}""", HttpStatusCode.Unauthorized) }
        val client = TestConfig.client(server, TokenProvider { "old" }, TokenRefresher { "newer" })
        assertFailsWith<NotSignedInException> { SupabaseRest(client, TestConfig.config).select("thing") }
        assertEquals(2, server.requestsTo("/rest/v1/thing").size)
        val anon = TestConfig.client(server, TokenProvider { null }, TokenRefresher { "never" })
        assertFailsWith<NotSignedInException> { SupabaseRest(anon, TestConfig.config).select("thing") }
        assertEquals(3, server.requestsTo("/rest/v1/thing").size, "the anon key is never retried")
        assertEquals("Bearer anon-key", server.requestsTo("/rest/v1/thing").last().headers["Authorization"])
    }

    @Test
    fun `site routes get the bearer token only and never the anon key`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Get, "/api/watchdog-true-cost") { json("[]") }
        val signedIn = SiteApi(TestConfig.client(server), TestConfig.config)
        signedIn.get("/api/watchdog-true-cost", mapOf("q" to "102 grant"))
        val first = server.requests.last()
        assertEquals("Bearer access-1", first.headers["Authorization"])
        assertNull(first.headers["apikey"])
        assertEquals("application/json", first.headers["Accept"])
        val signedOut = SiteApi(TestConfig.client(server, TokenProvider { null }), TestConfig.config)
        signedOut.get("/api/watchdog-true-cost", mapOf("q" to "102 grant"))
        assertNull(server.requests.last().headers["Authorization"])
        assertTrue(server.requests.last().headers["User-Agent"]!!.startsWith("Watchdog-Android/"))
        assertTrue(Regex("curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient", RegexOption.IGNORE_CASE).containsMatchIn(server.requests.last().headers["User-Agent"]!!).not())
    }

    @Test
    fun `postgrest helpers send the filters and prefer headers supabase-js sends`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/rest/v1/agent_opportunity_actions") { json("[]") }
        server.on(HttpMethod.Get, "/rest/v1/agent_farm_properties") { json("[]") }
        val rest = SupabaseRest(TestConfig.client(server), TestConfig.config)
        rest.select("agent_farm_properties", "id,address", listOf("relationship" to "in.(past_client,sphere)", "pams_pin" to "not.is.null"), order = "address.asc", limit = 1000)
        val get = server.requests.last()
        assertEquals("id,address", get.param("select"))
        assertEquals("in.(past_client,sphere)", get.param("relationship"))
        assertEquals("not.is.null", get.param("pams_pin"))
        assertEquals("1000", get.param("limit"))
        rest.upsert("agent_opportunity_actions", kotlinx.serialization.json.JsonArray(listOf(buildJsonObject { put("opportunity_key", "k") })), onConflict = "user_id,opportunity_key", returning = false)
        val post = server.requests.last()
        assertEquals("user_id,opportunity_key", post.param("on_conflict"))
        assertEquals("resolution=merge-duplicates,return=minimal", post.headers["Prefer"])
    }

    @Test
    fun `network failures become NetworkException`() = runBlocking {
        val engine = MockEngine { throw java.net.ConnectException("refused") }
        val client = WatchdogHttp.create(engine, TestConfig.config, TokenProvider { null })
        assertFailsWith<NetworkException> { SupabaseRest(client, TestConfig.config).select("thing") }
        Unit
    }

    @Test
    fun `server errors map to the exception the UI expects`() {
        assertIs<NotSignedInException>(WatchdogHttp.failure(401, buildJsonObject { put("error", "Sign in required") }))
        assertIs<NotSignedInException>(WatchdogHttp.failure(400, buildJsonObject { put("code", "P0001"); put("message", "AUTH_REQUIRED") }))
        assertIs<NotSignedInException>(WatchdogHttp.failure(401, buildJsonObject { put("error", "sign_in_required") }))
        assertIs<PlanRequiredException>(WatchdogHttp.failure(403, buildJsonObject { put("error", "Agent Control requires an Agent or professional plan."); put("code", "PLAN_REQUIRED") }))
        assertIs<PlanRequiredException>(WatchdogHttp.failure(403, buildJsonObject { put("error", "agent_plan_required"); put("plan", "standard") }))
        assertIs<PlanRequiredException>(WatchdogHttp.failure(403, buildJsonObject { put("code", "42501"); put("message", "new row violates row-level security policy for table \"agent_farm_properties\"") }))
        assertIs<PlanRequiredException>(WatchdogHttp.failure(402, null))

        val quota = WatchdogHttp.failure(429, buildJsonObject { put("error", "Data refresh limit reached. Try again after the usage window resets."); put("code", "AGENT_QUOTA_REQUESTS"); put("reset_at", "2026-09-30T14:05:00Z") })
        assertIs<QuotaException>(quota)
        assertEquals("Data refresh limit reached. Try again after the usage window resets.", quota.userMessage)
        assertEquals("2026-09-30T14:05:00Z", quota.resetAt)

        val plain = WatchdogHttp.failure(503, buildJsonObject { put("error", "Watchdog is unavailable right now. Try again in a minute.") })
        assertEquals("Watchdog is unavailable right now. Try again in a minute.", plain.userMessage)
        val raw = WatchdogHttp.failure(500, buildJsonObject { put("message", "relation \"public.nothing\" does not exist"); put("code", "42P01") })
        assertEquals("Watchdog could not reach the property intelligence service. Please try again.", raw.userMessage)
        val code = WatchdogHttp.failure(503, buildJsonObject { put("error", "service_unavailable") })
        assertEquals("Watchdog could not reach the property intelligence service. Please try again.", code.userMessage)
        val trigger = WatchdogHttp.failure(400, buildJsonObject { put("code", "P0001"); put("message", "You have reached the property workspace limit for your Agent plan. Remove properties or upgrade to continue.") })
        assertEquals("You have reached the property workspace limit for your Agent plan. Remove properties or upgrade to continue.", trigger.userMessage)
    }
}
