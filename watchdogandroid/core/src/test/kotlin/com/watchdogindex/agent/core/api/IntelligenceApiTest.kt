package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class IntelligenceApiTest {

    private fun api(server: FakeServer): IntelligenceApi {
        val client = TestConfig.client(server)
        return IntelligenceApi(SiteApi(client, TestConfig.config), SupabaseRest(client, TestConfig.config))
    }

    @Test
    fun `a non-JSON 502 from the analyst route maps by status`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/api/watchdog-intelligence-analyst") { respond("<html>502 Bad Gateway</html>", HttpStatusCode.BadGateway, headersOf(HttpHeaders.ContentType, "text/html")) }
        val e = assertFailsWith<HttpFailureException> { api(server).ask("Which clients should I call first?", listOf("0904_9_20")) }
        assertEquals(502, e.status)
        assertEquals("Watchdog could not reach the property intelligence service. Please try again.", e.userMessage)
    }

    @Test
    fun `a JSON 429 keeps its reset time and an unreadable 200 is a friendly error`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/api/watchdog-intelligence-analyst") { json("""{"error":"Intelligence limit reached for today.","code":"AGENT_QUOTA_INTELLIGENCE","reset_at":"2026-10-01T04:00:00Z"}""", HttpStatusCode.TooManyRequests) }
        val quota = assertFailsWith<QuotaException> { api(server).ask("q", emptyList()) }
        assertEquals("2026-10-01T04:00:00Z", quota.resetAt)
        assertEquals("Intelligence limit reached for today.", quota.userMessage)

        server.on(HttpMethod.Post, "/api/watchdog-intelligence-analyst") { respond("<html>ok</html>", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "text/html")) }
        val unreadable = assertFailsWith<WatchdogException> { api(server).ask("q", emptyList()) }
        assertTrue(unreadable.userMessage.contains("could not read"), unreadable.userMessage)
    }
}
