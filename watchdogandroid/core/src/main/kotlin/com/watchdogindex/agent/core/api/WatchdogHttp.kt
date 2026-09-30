package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.NetworkException
import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.WatchdogException
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.call.HttpClientCall
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.UserAgent
import io.ktor.client.plugins.api.Send
import io.ktor.client.plugins.api.createClientPlugin
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.accept
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.util.AttributeKey
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException

/*
 * The HTTP layer every live repository is built on.
 *
 * One Ktor client, configured once by the platform (OkHttp on Android, the JDK client on desktop, MockEngine in
 * tests), talks to three bases:
 *   - Supabase Auth      {authBase}       (auth-and-account.md sections 2, 4)
 *   - PostgREST / RPCs   {restBase}       (auth-and-account.md sections 8, 11; edge-function-contracts.md section 3)
 *   - Edge functions     {functionsBase}  (edge-function-contracts.md section 0.2: POST, Bearer + apikey + JSON)
 *   - The site's routes  {siteOrigin}/api (site-api-contracts.md section 1.3)
 *
 * Every Supabase call carries `apikey: <anon key>` and `Authorization: Bearer <access token>` (the anon key when
 * nobody is signed in); site routes only get the bearer token, because they validate it against
 * `GET /auth/v1/user` (site-api-contracts.md 1.3) and would reject the anon key. A 401 on a call made with a user
 * token is retried exactly once after the session refreshes (auth-and-account.md 4: "Give Supabase one recovery
 * attempt").
 */

/** Supplies the signed-in user's access token, or null when nobody is signed in. */
fun interface TokenProvider {
    suspend fun accessToken(): String?
}

/**
 * Refreshes the session after a server said the token was bad. Returns the new access token, or null when the
 * session could not be refreshed (the caller then surfaces "Sign in to continue.").
 */
fun interface TokenRefresher {
    suspend fun refreshAfterUnauthorized(staleToken: String): String?
}

/** Configuration for the [WatchdogAuth] plugin. */
class WatchdogAuthConfig {
    var config: WatchdogConfig = WatchdogConfig.Production
    var tokens: TokenProvider = TokenProvider { null }
    var refresher: TokenRefresher? = null
}

private val RetriedAfterRefresh = AttributeKey<Boolean>("WatchdogAuthRetried")

/**
 * Adds the Supabase `apikey` and the bearer token to every request and retries once after a 401 when the session
 * can be refreshed. Requests that already carry an `Authorization` header (the auth client sets the anon key on
 * sign-in calls) are left alone, and a request made with the anon key is never retried.
 */
val WatchdogAuth = createClientPlugin("WatchdogAuth", ::WatchdogAuthConfig) {
    val cfg = pluginConfig
    val anonKey = cfg.config.supabaseAnonKey
    val supabaseHost = hostOf(cfg.config.supabaseUrl)

    onRequest { request, _ ->
        val onSupabase = request.url.host.equals(supabaseHost, ignoreCase = true)
        if (onSupabase && !request.headers.contains("apikey")) request.headers.append("apikey", anonKey)
        if (!request.headers.contains(HttpHeaders.Authorization)) {
            val token = cfg.tokens.accessToken()
            when {
                token != null -> request.headers.append(HttpHeaders.Authorization, "Bearer $token")
                onSupabase -> request.headers.append(HttpHeaders.Authorization, "Bearer $anonKey")
            }
        }
    }

    on(Send) { request ->
        val call: HttpClientCall = proceed(request)
        if (call.response.status != HttpStatusCode.Unauthorized) return@on call
        if (request.attributes.getOrNull(RetriedAfterRefresh) == true) return@on call
        val used = request.headers[HttpHeaders.Authorization]?.removePrefix("Bearer ")?.trim()
        if (used.isNullOrEmpty() || used == anonKey) return@on call
        val refresher = cfg.refresher ?: return@on call
        val fresh = refresher.refreshAfterUnauthorized(used) ?: return@on call
        if (fresh == used) return@on call
        // Finish the first exchange before re-sending, so its body is drained and the connection is released.
        try {
            call.response.bodyAsText()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // The 401 body is not needed; a read failure changes nothing about the retry.
        }
        request.headers.remove(HttpHeaders.Authorization)
        request.headers.append(HttpHeaders.Authorization, "Bearer $fresh")
        request.attributes.put(RetriedAfterRefresh, true)
        proceed(request)
    }
}

private fun hostOf(url: String): String = url.substringAfter("://").substringBefore('/').substringBefore(':')

/**
 * A server answer the app could not use. [status] is the HTTP status, [code] the server's machine code when it
 * sent one (`PLAN_REQUIRED`, `AGENT_QUOTA_REQUESTS`, `42501`, ...), [serverError] the raw error text. The
 * [userMessage] is the server's own sentence when it reads as plain language, otherwise a friendly default.
 */
open class HttpFailureException(
    val status: Int,
    val code: String?,
    val serverError: String?,
    userMessage: String,
) : WatchdogException("HTTP $status ${code ?: ""} ${serverError ?: ""}".trim(), userMessage = userMessage)

/**
 * A 429: a plan capacity or request window was hit. The two ways a server says when to come back are kept apart:
 * [resetAt] is the body's `reset_at` timestamp when it sent one (the edge functions), [retryAfterSeconds] is a
 * numeric `Retry-After` header (the site's property route sends the seconds to UTC midnight). A UI that formats
 * [resetAt] as a date must never be handed a number of seconds.
 */
class QuotaException(
    status: Int,
    code: String?,
    serverError: String?,
    userMessage: String,
    val resetAt: String?,
    val limit: Int?,
    val retryAfterSeconds: Int? = null,
) : HttpFailureException(status, code, serverError, userMessage)

/** A 409 from a route that needs the caller to confirm something first (the Intelligence command policy). */
class ConfirmationRequiredException(val body: JsonObject, userMessage: String) : HttpFailureException(409, "CONFIRMATION_REQUIRED", null, userMessage)

object WatchdogHttp {
    /** Fallback version string when the platform does not pass one. */
    const val DEFAULT_APP_VERSION = "0.1.0"
    const val TIMEOUT_MILLIS = 20_000L

    /** Never contains curl, wget, python-requests or the other tokens the site's automation filter blocks (site-api-contracts.md 1.2). */
    fun userAgent(appVersion: String = DEFAULT_APP_VERSION): String = "Watchdog-Android/$appVersion (Android)"

    /** Lenient JSON for everything the backend sends: unknown keys are ignored so a new server field never crashes the app. */
    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = false
    }

    /** Builds the client on a platform engine. */
    fun create(
        engine: HttpClientEngine,
        config: WatchdogConfig,
        tokens: TokenProvider,
        refresher: TokenRefresher? = null,
        appVersion: String = DEFAULT_APP_VERSION,
    ): HttpClient = HttpClient(engine) { configureWatchdog(config, tokens, refresher, appVersion) }

    /**
     * Re-configures a client the platform already built (Ktor keeps the engine and adds the plugins). This is what
     * `LiveRepositories.create` uses, because the session manager that supplies tokens is created there.
     */
    fun configure(
        base: HttpClient,
        config: WatchdogConfig,
        tokens: TokenProvider,
        refresher: TokenRefresher? = null,
        appVersion: String = DEFAULT_APP_VERSION,
    ): HttpClient = base.config { configureWatchdog(config, tokens, refresher, appVersion) }

    private fun HttpClientConfig<*>.configureWatchdog(config: WatchdogConfig, tokens: TokenProvider, refresher: TokenRefresher?, appVersion: String) {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        install(HttpTimeout) {
            requestTimeoutMillis = TIMEOUT_MILLIS
            connectTimeoutMillis = TIMEOUT_MILLIS
            socketTimeoutMillis = TIMEOUT_MILLIS
        }
        install(UserAgent) { agent = userAgent(appVersion) }
        install(WatchdogAuth) {
            this.config = config
            this.tokens = tokens
            this.refresher = refresher
        }
    }

    // ------------------------------------------------------------------ requests and error mapping

    /**
     * Runs a request and turns transport failures into [NetworkException]. Statuses are not checked here; use
     * [expectOk] on the result so each caller decides which statuses it handles itself.
     */
    suspend fun send(client: HttpClient, block: HttpRequestBuilder.() -> Unit): HttpResponse {
        return try {
            client.request(block)
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpRequestTimeoutException) {
            throw NetworkException(e)
        } catch (e: IOException) {
            throw NetworkException(e)
        } catch (e: java.nio.channels.UnresolvedAddressException) {
            throw NetworkException(e)
        } catch (e: Exception) {
            if (e is WatchdogException) throw e
            val name = e::class.simpleName ?: ""
            if (name.contains("Timeout") || name.contains("Connect") || name.contains("Socket")) throw NetworkException(e)
            throw WatchdogException("Request failed: ${e.message}", e, "Watchdog couldn't complete that request. Please try again.")
        }
    }

    /** Throws the mapped [WatchdogException] unless the status is 2xx. Returns the response for chaining. */
    suspend fun expectOk(response: HttpResponse, feature: String): HttpResponse {
        if (response.status.value in 200..299) return response
        throw failure(response, feature)
    }

    /** Maps a non-2xx response to the exception the UI should see (auth-and-account.md 10.2, agent-desk-web-reference.md 0.5). */
    suspend fun failure(response: HttpResponse, feature: String): WatchdogException {
        val text = runCatching { response.bodyAsText() }.getOrNull().orEmpty()
        val body = parseJsonOrNull(text) as? JsonObject
        return failure(response.status.value, body, text, feature, response.headers[HttpHeaders.RetryAfter])
    }

    fun failure(status: Int, body: JsonObject?, rawText: String = "", feature: String = "this feature", retryAfter: String? = null): WatchdogException {
        val serverError = body?.let { errorText(it) }?.takeIf { it.isNotBlank() } ?: rawText.takeIf { it.isNotBlank() && it.length <= 200 && !it.trimStart().startsWith("<") }
        val code = body?.let { codeText(it) }
        val plain = serverError?.takeIf { isPlainLanguage(it) }
        val lowerError = (serverError ?: "").lowercase()
        val lowerCode = (code ?: "").lowercase()

        if (status == 401 || lowerCode in AUTH_CODES || lowerError in AUTH_CODES || AUTH_TEXT.containsMatchIn(lowerError)) return NotSignedInException()
        if (status == 402) return PlanRequiredException(feature)
        if (status == 403) {
            if (lowerError.contains("origin") || lowerCode == "origin_not_allowed") {
                return HttpFailureException(status, code, serverError, "Watchdog couldn't complete that request. Please try again.")
            }
            // Only a plan code, or a sentence about the plan, is a plan gate; any other 403 keeps the server's own sentence.
            if (lowerCode in PLAN_CODES || (plain != null && PLAN_TEXT.containsMatchIn(plain))) return planException(feature, plain)
            return HttpFailureException(status, code, serverError, plain ?: "This action is not available for your current plan.")
        }
        if (status == 429) {
            val message = plain ?: "Your current plan capacity has been reached. Reduce the request or upgrade to continue."
            val reset = body?.get("reset_at")?.stringOrNull()
            val limit = body?.get("limit")?.intOrNull()
            // Retry-After may also be an HTTP date; only a plain number of seconds is kept.
            val retryAfterSeconds = retryAfter?.trim()?.toIntOrNull()?.takeIf { it >= 0 }
            return QuotaException(status, code, serverError, message, reset, limit, retryAfterSeconds)
        }
        if (status == 409 && body != null && (body.containsKey("confirmation") || lowerCode == "confirmation_required")) {
            val confirmation = body["confirmation"] as? JsonObject
            val message = confirmation?.get("body")?.stringOrNull()?.takeIf { it.isNotBlank() } ?: plain ?: "This action needs your confirmation first."
            return ConfirmationRequiredException(body, message)
        }
        if (lowerCode in PLAN_CODES) return planException(feature, plain)
        if (lowerCode == "p0001" && plain != null) return HttpFailureException(status, code, serverError, plain)
        val fallback = when {
            status == 404 -> "Watchdog could not find that."
            status >= 500 -> "Watchdog could not reach the property intelligence service. Please try again."
            else -> "Watchdog couldn't complete that request. Please try again."
        }
        return HttpFailureException(status, code, serverError, plain ?: KNOWN_CODE_MESSAGES[lowerCode] ?: KNOWN_CODE_MESSAGES[lowerError] ?: fallback)
    }

    /**
     * `PlanRequiredException` is final and carries the app's own sentence ("This is part of the Agent plan."), so
     * the server's wording ("The browser extension is part of the Agent plan.") travels in the debug message only.
     */
    private fun planException(feature: String, plain: String?): PlanRequiredException =
        PlanRequiredException(if (plain != null) "$feature ($plain)" else feature)

    /** True when a server string is a sentence the app can show as-is: it has spaces, is not a code and is not a raw database error. */
    fun isPlainLanguage(text: String): Boolean {
        val t = text.trim()
        if (t.length < 8 || t.length > 400) return false
        if (!t.contains(' ')) return false
        if (RAW_DB_ERROR.containsMatchIn(t)) return false
        if (t.all { it.isUpperCase() || it == '_' || it.isWhitespace() }) return false
        return true
    }

    private fun errorText(body: JsonObject): String? {
        for (key in listOf("error", "message", "msg", "error_description")) {
            val v = body[key] ?: continue
            when (v) {
                is JsonPrimitive -> v.contentOrNull?.let { return it }
                is JsonObject -> (v["message"] ?: v["msg"])?.stringOrNull()?.let { return it }
                else -> {}
            }
        }
        return null
    }

    private fun codeText(body: JsonObject): String? {
        for (key in listOf("code", "error_code")) body[key]?.stringOrNull()?.let { return it }
        // Snake_case error strings ("agent_plan_required") double as codes.
        val error = body["error"]?.stringOrNull() ?: return null
        return if (!error.contains(' ') && error.length <= 60) error else null
    }

    fun parseJsonOrNull(text: String): JsonElement? {
        if (text.isBlank()) return null
        return runCatching { json.parseToJsonElement(text) }.getOrNull()
    }

    private val AUTH_CODES = setOf("sign_in_required", "session_invalid", "auth_required", "sign_in_required.")
    private val PLAN_CODES = setOf("plan_required", "agent_plan_required", "42501")
    /** A 403 sentence that names the plan ("...is part of the Agent plan.", "Upgrade to Pro...") is a plan gate, not a permission error. */
    private val PLAN_TEXT = Regex("\\bplan\\b|\\bagent\\b|\\bpro\\b|upgrade", RegexOption.IGNORE_CASE)
    private val AUTH_TEXT = Regex("^(sign in required|session invalid|authentication required|sign in again|not signed in|jwt expired|invalid jwt)")
    private val RAW_DB_ERROR = Regex("row.level|row-level|\\brls\\b|postgres|postgrest|pgrst\\d|relation |violates|constraint|permission denied|\\brpc\\b|sqlstate", RegexOption.IGNORE_CASE)
    private val KNOWN_CODE_MESSAGES = mapOf(
        "service_unavailable" to "Watchdog could not reach the property intelligence service. Please try again.",
        "invalid_json" to "Watchdog couldn't complete that request. Please try again.",
        "unknown_action" to "Watchdog couldn't complete that request. Please try again.",
        "method_not_allowed" to "Watchdog couldn't complete that request. Please try again.",
        "registration_failed" to "Push registration didn't go through. Try again later.",
        "token_required" to "Push registration didn't go through. Try again later.",
        "installation_id_required" to "Push registration didn't go through. Try again later.",
        "platform_invalid" to "Push registration didn't go through. Try again later.",
        "contacts_required" to "Add at least one address to import.",
        "location_not_found" to "That address could not be placed on the map.",
        "no_billing_account" to "No billing account exists yet.",
    )
}

internal fun JsonElement.stringOrNull(): String? = (this as? JsonPrimitive)?.contentOrNull
internal fun JsonElement.intOrNull(): Int? = (this as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()?.toInt()
internal fun JsonElement.doubleOrNull(): Double? = (this as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()
internal fun JsonElement.boolOrNull(): Boolean? = (this as? JsonPrimitive)?.contentOrNull?.let { if (it == "true") true else if (it == "false") false else null }
internal fun JsonObject.str(key: String): String? = this[key]?.takeUnless { it is JsonNull }?.stringOrNull()
internal fun JsonObject.num(key: String): Double? = this[key]?.takeUnless { it is JsonNull }?.doubleOrNull()
internal fun JsonObject.int(key: String): Int? = this[key]?.takeUnless { it is JsonNull }?.intOrNull()
internal fun JsonObject.bool(key: String): Boolean? = this[key]?.takeUnless { it is JsonNull }?.boolOrNull()
internal fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
internal fun JsonObject.arr(key: String): JsonArray? = this[key] as? JsonArray

// ---------------------------------------------------------------------- PostgREST

/**
 * PostgREST on the shared project with the user's session. Filters are PostgREST expressions
 * (`"user_id" to "eq.<uuid>"`, `"relationship" to "in.(past_client,sphere)"`, `"pams_pin" to "not.is.null"`).
 * `maybeSingle` is done with `limit=1` and an array read, so a missing row is `null` instead of a PGRST116 error.
 */
class SupabaseRest(val client: HttpClient, val config: WatchdogConfig) {

    suspend fun rpc(name: String, params: JsonObject = JsonObject(emptyMap()), feature: String = name): JsonElement {
        val response = WatchdogHttp.send(client) {
            method = HttpMethod.Post
            url("${config.restBase}/rpc/$name")
            contentType(ContentType.Application.Json)
            accept(ContentType.Application.Json)
            setBody(params)
        }
        WatchdogHttp.expectOk(response, feature)
        return response.jsonBody()
    }

    suspend fun select(
        table: String,
        select: String = "*",
        filters: List<Pair<String, String>> = emptyList(),
        order: String? = null,
        limit: Int? = null,
        feature: String = table,
    ): JsonArray {
        val response = WatchdogHttp.send(client) {
            method = HttpMethod.Get
            url("${config.restBase}/$table")
            parameter("select", select)
            filters.forEach { (column, expression) -> parameter(column, expression) }
            if (order != null) parameter("order", order)
            if (limit != null) parameter("limit", limit)
            accept(ContentType.Application.Json)
        }
        WatchdogHttp.expectOk(response, feature)
        return response.jsonBody() as? JsonArray ?: JsonArray(emptyList())
    }

    suspend fun maybeSingle(table: String, select: String, filters: List<Pair<String, String>>, feature: String = table): JsonObject? =
        select(table, select, filters, limit = 1, feature = feature).firstOrNull() as? JsonObject

    suspend fun insert(table: String, rows: JsonArray, feature: String = table): JsonArray = write(HttpMethod.Post, table, rows, emptyList(), "return=representation", null, feature)

    /** `Prefer: resolution=merge-duplicates` with `on_conflict`, the shape supabase-js sends for `upsert(..., { onConflict })`. */
    suspend fun upsert(table: String, rows: JsonArray, onConflict: String, feature: String = table, returning: Boolean = true): JsonArray =
        write(HttpMethod.Post, table, rows, emptyList(), "resolution=merge-duplicates" + (if (returning) ",return=representation" else ",return=minimal"), onConflict, feature)

    suspend fun update(table: String, patch: JsonObject, filters: List<Pair<String, String>>, feature: String = table): JsonArray =
        write(HttpMethod.Patch, table, patch, filters, "return=representation", null, feature)

    suspend fun delete(table: String, filters: List<Pair<String, String>>, feature: String = table) {
        val response = WatchdogHttp.send(client) {
            method = HttpMethod.Delete
            url("${config.restBase}/$table")
            filters.forEach { (column, expression) -> parameter(column, expression) }
            header(HttpHeaders.Prefer, "return=minimal")
        }
        WatchdogHttp.expectOk(response, feature)
    }

    private suspend fun write(
        httpMethod: HttpMethod,
        table: String,
        body: JsonElement,
        filters: List<Pair<String, String>>,
        prefer: String,
        onConflict: String?,
        feature: String,
    ): JsonArray {
        val response = WatchdogHttp.send(client) {
            method = httpMethod
            url("${config.restBase}/$table")
            filters.forEach { (column, expression) -> parameter(column, expression) }
            if (onConflict != null) parameter("on_conflict", onConflict)
            header(HttpHeaders.Prefer, prefer)
            contentType(ContentType.Application.Json)
            accept(ContentType.Application.Json)
            setBody(body)
        }
        WatchdogHttp.expectOk(response, feature)
        return response.jsonBody() as? JsonArray ?: JsonArray(emptyList())
    }
}

// ---------------------------------------------------------------------- edge functions

/** `POST {functionsBase}/{name}` with a JSON body, the only shape any user-facing function accepts (edge-function-contracts.md 0.2). */
class EdgeFunctions(val client: HttpClient, val config: WatchdogConfig) {
    suspend fun post(name: String, body: JsonObject, feature: String = name): JsonObject {
        val response = raw(name, body)
        WatchdogHttp.expectOk(response, feature)
        return response.jsonBody() as? JsonObject ?: JsonObject(emptyMap())
    }

    /** The response without status checking, for callers that read 4xx bodies themselves. */
    suspend fun raw(name: String, body: JsonObject): HttpResponse = WatchdogHttp.send(client) {
        method = HttpMethod.Post
        url("${config.functionsBase}/$name")
        contentType(ContentType.Application.Json)
        accept(ContentType.Application.Json)
        setBody(body)
    }
}

// ---------------------------------------------------------------------- the site

/** The Vercel routes under `{siteOrigin}/api/...` (site-api-contracts.md section 3). */
class SiteApi(val client: HttpClient, val config: WatchdogConfig) {
    suspend fun get(path: String, params: Map<String, String?> = emptyMap()): HttpResponse = WatchdogHttp.send(client) {
        method = HttpMethod.Get
        url(config.siteOrigin + path)
        params.forEach { (k, v) -> if (v != null) parameter(k, v) }
        accept(ContentType.Application.Json)
    }

    suspend fun post(path: String, body: JsonObject): HttpResponse = WatchdogHttp.send(client) {
        method = HttpMethod.Post
        url(config.siteOrigin + path)
        contentType(ContentType.Application.Json)
        accept(ContentType.Application.Json)
        setBody(body)
    }

    suspend fun getJson(path: String, params: Map<String, String?> = emptyMap(), feature: String = path): JsonElement {
        val response = get(path, params)
        WatchdogHttp.expectOk(response, feature)
        return response.jsonBody()
    }

    suspend fun postJson(path: String, body: JsonObject, feature: String = path): JsonObject {
        val response = post(path, body)
        WatchdogHttp.expectOk(response, feature)
        return response.jsonBody() as? JsonObject ?: JsonObject(emptyMap())
    }
}

/** Parses a JSON body; an empty body becomes `null`, HTML or garbage becomes a friendly error. */
suspend fun HttpResponse.jsonBody(): JsonElement {
    val text = bodyAsText()
    if (text.isBlank()) return JsonNull
    return WatchdogHttp.parseJsonOrNull(text)
        ?: throw WatchdogException("Unexpected response body", userMessage = "Watchdog sent back something the app could not read. Please try again.")
}

internal fun JsonElement.asObjectOrNull(): JsonObject? = this as? JsonObject
internal fun JsonElement.firstObjectOrNull(): JsonObject? = when (this) {
    is JsonArray -> firstOrNull() as? JsonObject
    is JsonObject -> this
    else -> null
}
internal fun JsonElement.objectField(key: String): JsonElement? = (this as? JsonObject)?.get(key)
internal fun JsonElement.primitiveString(): String? = runCatching { jsonPrimitive.contentOrNull }.getOrNull()
internal fun JsonElement.asJsonObjectOr(default: JsonObject = JsonObject(emptyMap())): JsonObject = runCatching { jsonObject }.getOrDefault(default)
