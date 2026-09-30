package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.model.AuthSession
import com.watchdogindex.agent.core.repo.live.LiveRepositories
import com.watchdogindex.agent.core.repo.live.LiveRepositorySet
import com.watchdogindex.agent.core.sample.InMemoryKeyValueStore
import com.watchdogindex.agent.core.session.InMemorySessionStore
import com.watchdogindex.agent.core.session.SessionManager
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.Url
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlinx.datetime.Instant
import kotlinx.serialization.json.JsonObject

/** A fake backend for the live layer: routes by method and path, records every request, answers JSON. */
class FakeServer {
    data class Recorded(val method: HttpMethod, val url: Url, val headers: Headers, val body: String) {
        val path: String get() = url.encodedPath
        fun param(name: String): String? = url.parameters[name]
        fun json(): JsonObject? = WatchdogHttp.parseJsonOrNull(body) as? JsonObject
    }

    private class Route(val method: HttpMethod?, val match: (String) -> Boolean, val handler: suspend MockRequestHandleScope.(Recorded) -> HttpResponseData)

    val requests = mutableListOf<Recorded>()
    private val routes = mutableListOf<Route>()

    fun on(method: HttpMethod? = null, path: String, handler: suspend MockRequestHandleScope.(Recorded) -> HttpResponseData) {
        routes += Route(method, { it == path }, handler)
    }

    fun onPrefix(method: HttpMethod? = null, prefix: String, handler: suspend MockRequestHandleScope.(Recorded) -> HttpResponseData) {
        routes += Route(method, { it.startsWith(prefix) }, handler)
    }

    fun requestsTo(path: String) = requests.filter { it.path == path }

    val engine: MockEngine = MockEngine { request: HttpRequestData ->
        val body = request.body.toByteArray().decodeToString()
        val recorded = Recorded(request.method, request.url, request.headers, body)
        requests += recorded
        val route = routes.lastOrNull { (it.method == null || it.method == request.method) && it.match(request.url.encodedPath) }
        if (route == null) respond("""{"error":"no route for ${request.method.value} ${request.url.encodedPath}"}""", HttpStatusCode.NotFound, JSON_HEADERS)
        else route.handler(this, recorded)
    }

    companion object {
        val JSON_HEADERS = headersOf(HttpHeaders.ContentType, "application/json")
        fun MockRequestHandleScope.json(content: String, status: HttpStatusCode = HttpStatusCode.OK, extra: Headers? = null): HttpResponseData {
            val headers = if (extra == null) JSON_HEADERS else Headers.build { appendAll(JSON_HEADERS); appendAll(extra) }
            return respond(content, status, headers)
        }
    }
}

object TestConfig {
    val config = WatchdogConfig(supabaseUrl = "https://test.supabase.co", supabaseAnonKey = "anon-key", siteOrigin = "https://www.watchdogindex.com")
    val now: Instant = Instant.parse("2026-09-30T14:00:00Z")
    val session = AuthSession("access-1", "refresh-1", now.epochSeconds + 3600, "user-1", "agent@example.com")

    fun client(server: FakeServer, tokens: TokenProvider = TokenProvider { session.accessToken }, refresher: TokenRefresher? = null, appVersion: String = "1.2.3"): HttpClient =
        WatchdogHttp.create(server.engine, config, tokens, refresher, appVersion)

    /** A signed-in live set on the fake server, with a store and clock fixed at [now]. */
    fun liveSet(server: FakeServer, store: InMemoryKeyValueStore = InMemoryKeyValueStore(), nowProvider: () -> Instant = { now }): LiveRepositorySet {
        var manager: SessionManager? = null
        val client = WatchdogHttp.create(server.engine, config, TokenProvider { manager?.validAccessToken() }, TokenRefresher { s -> manager?.refresher?.refreshAfterUnauthorized(s) }, "1.2.3")
        val auth = SupabaseAuthClient(client, config) { nowProvider().epochSeconds }
        val session = SessionManager(auth, InMemorySessionStore(session)) { nowProvider().epochSeconds }
        manager = session
        runBlocking { session.restore() }
        return LiveRepositories.build(config, client, session, auth, store, nowProvider)
    }
}
