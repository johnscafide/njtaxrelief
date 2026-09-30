package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.FakeServer.Companion.json
import com.watchdogindex.agent.core.model.AuthSession
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.core.session.InMemorySessionStore
import com.watchdogindex.agent.core.session.SessionManager
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SupabaseAuthClientTest {
    private val nowSeconds = TestConfig.now.epochSeconds

    private fun sessionJson(access: String, refresh: String, expiresIn: Long = 3600, expiresAt: Long? = null) = """
        {"access_token":"$access","token_type":"bearer","expires_in":$expiresIn${expiresAt?.let { ",\"expires_at\":$it" } ?: ""},
         "refresh_token":"$refresh","user":{"id":"user-1","email":"agent@example.com","user_metadata":{"full_name":"Alex Moreno"}}}
    """.trimIndent()

    @Test
    fun `send code posts the web's otp body with the anon key`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/otp") { json("{}") }
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        auth.signInWithOtp("  Agent@Example.com ")
        val req = server.requestsTo("/auth/v1/otp").single()
        assertEquals("agent@example.com", req.json()!!.str("email"))
        assertEquals(true, req.json()!!.bool("create_user"))
        assertEquals("anon-key", req.headers["apikey"])
        assertEquals("Bearer anon-key", req.headers["Authorization"])
        assertEquals("Watchdog-Android/1.2.3 (Android)", req.headers["User-Agent"])
    }

    @Test
    fun `send code refuses a typo and a rate limit with the web's copy`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/otp") { json("""{"code":429,"msg":"For security purposes, you can only request this after 60 seconds."}""", HttpStatusCode.TooManyRequests) }
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        val typo = assertFailsWith<WatchdogException> { auth.signInWithOtp("alex@gamil.com") }
        assertTrue(typo.userMessage.contains("alex@gmail.com"))
        val limited = assertFailsWith<WatchdogException> { auth.signInWithOtp("alex@example.com") }
        assertEquals("Please wait a moment before requesting another code.", limited.userMessage)
    }

    @Test
    fun `verify posts type email and parses the session`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/verify") { json(sessionJson("a1", "r1", expiresAt = nowSeconds + 3600)) }
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        val session = auth.verifyOtp("agent@example.com", "12 34 56")
        val body = server.requestsTo("/auth/v1/verify").single().json()!!
        assertEquals("email", body.str("type"))
        assertEquals("123456", body.str("token"))
        assertEquals(AuthSession("a1", "r1", nowSeconds + 3600, "user-1", "agent@example.com"), session)
        assertFailsWith<WatchdogException> { auth.verifyOtp("agent@example.com", "12345") }
    }

    @Test
    fun `a bad code maps to the invalid or expired sentence`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/verify") { json("""{"code":403,"error_code":"otp_expired","msg":"Token has expired or is invalid"}""", HttpStatusCode.Forbidden) }
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        val e = assertFailsWith<WatchdogException> { auth.verifyOtp("agent@example.com", "000000") }
        assertEquals("That code is invalid or expired. Request a new code and try again.", e.userMessage)
    }

    @Test
    fun `refresh uses the refresh_token grant and expires_in when expires_at is missing`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/token") { json(sessionJson("a2", "r2", expiresIn = 900)) }
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        val session = auth.refresh("r1")
        val req = server.requestsTo("/auth/v1/token").single()
        assertEquals("refresh_token", req.param("grant_type"))
        assertEquals("r1", req.json()!!.str("refresh_token"))
        assertEquals("a2", session.accessToken)
        assertEquals(nowSeconds + 900, session.expiresAtEpochSeconds)
    }

    @Test
    fun `invalid_grant is its own exception`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/token") { json("""{"error":"invalid_grant","error_description":"Invalid Refresh Token: Refresh Token Not Found"}""", HttpStatusCode.BadRequest) }
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        assertFailsWith<InvalidGrantException> { auth.refresh("dead") }
        Unit
    }

    @Test
    fun `session manager refreshes proactively within sixty seconds of expiry`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/token") { json(sessionJson("fresh", "r2", expiresIn = 3600)) }
        val store = InMemorySessionStore(AuthSession("stale", "r1", nowSeconds + 30, "user-1", "agent@example.com"))
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        val manager = SessionManager(auth, store) { nowSeconds }
        manager.restore()
        assertEquals("fresh", (manager.state.value as AuthState.SignedIn).session.accessToken)
        assertEquals("fresh", store.load()?.accessToken)
        assertEquals(1, server.requestsTo("/auth/v1/token").size)
        assertEquals("fresh", manager.tokenProvider.accessToken())
        assertEquals(1, server.requestsTo("/auth/v1/token").size, "a token that is not near expiry is not refreshed again")
    }

    @Test
    fun `session manager clears everything when the refresh token is dead`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/token") { json("""{"error":"invalid_grant","error_description":"Invalid Refresh Token"}""", HttpStatusCode.BadRequest) }
        val store = InMemorySessionStore(AuthSession("stale", "r1", nowSeconds - 10, "user-1", "agent@example.com"))
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        val manager = SessionManager(auth, store) { nowSeconds }
        manager.restore()
        assertIs<AuthState.SignedOut>(manager.state.value)
        assertNull(store.load())
        assertNull(manager.tokenProvider.accessToken())
    }

    @Test
    fun `sign out posts logout with scope local and forgets the session even when the token is dead`() = runBlocking {
        val server = FakeServer()
        server.on(HttpMethod.Post, "/auth/v1/logout") { json("""{"error":"invalid JWT"}""", HttpStatusCode.Unauthorized) }
        val store = InMemorySessionStore(TestConfig.session)
        val auth = SupabaseAuthClient(TestConfig.client(server, TokenProvider { null }), TestConfig.config) { nowSeconds }
        val manager = SessionManager(auth, store) { nowSeconds }
        manager.restore()
        manager.signOut()
        assertEquals("local", server.requestsTo("/auth/v1/logout").single().param("scope"))
        assertIs<AuthState.SignedOut>(manager.state.value)
        assertNull(store.load())
    }
}
