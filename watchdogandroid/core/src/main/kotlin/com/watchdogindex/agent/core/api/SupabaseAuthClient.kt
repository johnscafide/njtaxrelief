package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.AuthSession
import io.ktor.client.HttpClient
import io.ktor.client.request.accept
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import kotlinx.datetime.Clock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Supabase Auth (GoTrue) over REST, the same six-digit email code flow the website's Agent Desk uses
 * (auth-and-account.md section 2). The website goes through supabase-js; these are the REST calls behind it:
 *
 * - `POST {authBase}/otp`                          `{ email, create_user: true }`        = `signInWithOtp({ email, options: { shouldCreateUser: true } })`
 * - `POST {authBase}/verify`                       `{ type: "email", email, token }`     = `verifyOtp({ email, token, type: 'email' })`
 * - `POST {authBase}/token?grant_type=refresh_token` `{ refresh_token }`               = `refreshSession()`
 * - `GET  {authBase}/user`                         bearer = the user's access token      = `getUser()`
 * - `POST {authBase}/logout?scope=local|global`    bearer = the user's access token      = `signOut({ scope })`
 *
 * Sign-in calls send the anon key as the bearer explicitly, so the auth plugin never retries them.
 */
class SupabaseAuthClient(
    private val client: HttpClient,
    private val config: WatchdogConfig,
    private val nowEpochSeconds: () -> Long = { Clock.System.now().epochSeconds },
) {

    /** Sends the six-digit code and creates the account on first use (the web's `shouldCreateUser: true`). */
    suspend fun signInWithOtp(email: String) {
        val clean = normalizeEmail(email)
        EmailQuality.check(clean)?.let { throw it }
        val response = post("${config.authBase}/otp", anonBearer = true) {
            setBody(buildJsonObject {
                put("email", clean)
                put("create_user", true)
            })
        }
        if (response.status.value !in 200..299) throw authFailure(response, sendingCode = true)
    }

    /** Exchanges the code for a session. The code is stripped to digits and must be six of them, as on the web. */
    suspend fun verifyOtp(email: String, code: String): AuthSession {
        val clean = normalizeEmail(email)
        val digits = code.filter { it.isDigit() }.take(6)
        if (digits.length != 6) throw WatchdogException("Code must be six digits", userMessage = "Enter the six-digit code from the email.")
        val response = post("${config.authBase}/verify", anonBearer = true) {
            setBody(buildJsonObject {
                put("type", "email")
                put("email", clean)
                put("token", digits)
            })
        }
        if (response.status.value !in 200..299) throw authFailure(response, sendingCode = false)
        return parseSession(response.jsonBody().asJsonObjectOr())
            ?: throw WatchdogException("No session in verify response", userMessage = "A session was not created. Please request a new code.")
    }

    /**
     * Trades the refresh token for a new session. Throws [InvalidGrantException] when GoTrue says the refresh token
     * is gone (revoked, already used, session deleted): the caller must clear the stored session.
     */
    suspend fun refresh(refreshToken: String): AuthSession {
        val response = post("${config.authBase}/token", anonBearer = true) {
            parameter("grant_type", "refresh_token")
            setBody(buildJsonObject { put("refresh_token", refreshToken) })
        }
        if (response.status.value !in 200..299) {
            val body = WatchdogHttp.parseJsonOrNull(runCatching { response.jsonBodyText() }.getOrDefault("")) as? JsonObject
            if (isInvalidGrant(response.status.value, body)) throw InvalidGrantException(body?.let { errorMessage(it) })
            throw WatchdogHttp.failure(response.status.value, body, feature = "session refresh")
        }
        return parseSession(response.jsonBody().asJsonObjectOr())
            ?: throw WatchdogException("No session in refresh response", userMessage = "Sign in to continue.")
    }

    /** The auth user record: email, `created_at`, `user_metadata` (preferred name, full name, avatar). */
    suspend fun getUser(accessToken: String): JsonObject {
        val response = WatchdogHttp.send(client) {
            method = HttpMethod.Get
            url("${config.authBase}/user")
            header(HttpHeaders.Authorization, "Bearer $accessToken")
            accept(ContentType.Application.Json)
        }
        if (response.status.value == 401 || response.status.value == 403) throw NotSignedInException()
        WatchdogHttp.expectOk(response, "account")
        return response.jsonBody().asJsonObjectOr()
    }

    /** `scope` is `local` (this device) or `global` (all devices), the two the account page offers. A dead token is not an error here. */
    suspend fun signOut(accessToken: String, scope: String = "local") {
        val response = post("${config.authBase}/logout", anonBearer = false) {
            parameter("scope", scope)
            header(HttpHeaders.Authorization, "Bearer $accessToken")
        }
        if (response.status.value !in 200..299 && response.status.value != 401 && response.status.value != 403 && response.status.value != 404) {
            throw WatchdogHttp.failure(response, "sign out")
        }
    }

    // ------------------------------------------------------------------ parsing

    /** A GoTrue session: `access_token`, `refresh_token`, `expires_in`, sometimes `expires_at` (epoch seconds), and the `user`. */
    fun parseSession(body: JsonObject): AuthSession? {
        val session = if (body.containsKey("access_token")) body else body.obj("session") ?: return null
        val access = session.str("access_token") ?: return null
        val refresh = session.str("refresh_token") ?: return null
        val user = session.obj("user") ?: body.obj("user") ?: JsonObject(emptyMap())
        val expiresAt = session.num("expires_at")?.toLong()
            ?: session.num("expires_in")?.toLong()?.let { nowEpochSeconds() + it }
            ?: (nowEpochSeconds() + DEFAULT_LIFETIME_SECONDS)
        return AuthSession(
            accessToken = access,
            refreshToken = refresh,
            expiresAtEpochSeconds = expiresAt,
            userId = user.str("id") ?: jwtSubject(access) ?: "",
            email = user.str("email") ?: "",
        )
    }

    private suspend fun post(url: String, anonBearer: Boolean, block: io.ktor.client.request.HttpRequestBuilder.() -> Unit): HttpResponse =
        WatchdogHttp.send(client) {
            method = HttpMethod.Post
            url(url)
            contentType(ContentType.Application.Json)
            accept(ContentType.Application.Json)
            if (anonBearer) header(HttpHeaders.Authorization, "Bearer ${config.supabaseAnonKey}")
            block()
        }

    /** The website's error copy for the code flow (auth-and-account.md 2.4). */
    private suspend fun authFailure(response: HttpResponse, sendingCode: Boolean): WatchdogException {
        val text = runCatching { response.jsonBodyText() }.getOrDefault("")
        val body = WatchdogHttp.parseJsonOrNull(text) as? JsonObject
        val message = body?.let { errorMessage(it) } ?: text.take(200)
        val friendly = when {
            Regex("rate limit|seconds|too many", RegexOption.IGNORE_CASE).containsMatchIn(message) || response.status.value == 429 ->
                "Please wait a moment before requesting another code."
            Regex("not authorized|unauthorized email", RegexOption.IGNORE_CASE).containsMatchIn(message) ->
                "Email delivery is not available for this address yet."
            Regex("expired|invalid.*token|token.*invalid|otp", RegexOption.IGNORE_CASE).containsMatchIn(message) ->
                "That code is invalid or expired. Request a new code and try again."
            WatchdogHttp.isPlainLanguage(message) -> message
            sendingCode -> "We could not send the code. Please try again."
            else -> "We could not complete email sign-in. Please try again."
        }
        return WatchdogException("Auth ${response.status.value}: $message", userMessage = friendly)
    }

    private fun errorMessage(body: JsonObject): String? =
        body.str("msg") ?: body.str("error_description") ?: body.str("message") ?: body.str("error")

    /**
     * Only a body that names the grant or session as gone proves the refresh token is dead. A 401 or 403 without
     * that signal (an empty body, a gateway page, a passing auth outage) falls through to [WatchdogHttp.failure]:
     * the stored session is kept and the caller shows an error instead of signing the agent out.
     */
    private fun isInvalidGrant(status: Int, body: JsonObject?): Boolean {
        if (body == null) return status == 400
        val error = (body.str("error") ?: "").lowercase()
        val code = (body.str("error_code") ?: "").lowercase()
        val msg = (errorMessage(body) ?: "").lowercase()
        return error == "invalid_grant" || code.startsWith("refresh_token") || code.startsWith("session_") ||
            msg.contains("refresh token") || msg.contains("invalid grant")
    }

    companion object {
        const val DEFAULT_LIFETIME_SECONDS = 3600L

        fun normalizeEmail(email: String): String = email.trim().lowercase()

        /** The `sub` claim of a JWT, without verifying it (the server verifies; this only labels the session). */
        fun jwtSubject(jwt: String): String? {
            val parts = jwt.split('.')
            if (parts.size < 2) return null
            return runCatching {
                val payload = String(java.util.Base64.getUrlDecoder().decode(parts[1].padEnd((parts[1].length + 3) / 4 * 4, '=')))
                (WatchdogHttp.parseJsonOrNull(payload) as? JsonObject)?.str("sub")
            }.getOrNull()
        }
    }
}

/** GoTrue refused the refresh token: the stored session is dead and must be cleared. */
class InvalidGrantException(detail: String?) : WatchdogException("invalid_grant: ${detail ?: ""}", userMessage = "Your session expired. Sign in again and retry.")

/**
 * The website's client-side email check before `signInWithOtp` (auth-and-account.md 2.1: `checkEmailQuality`):
 * a shape check and a short typo list, so an obvious mistake is caught before a code goes nowhere.
 */
object EmailQuality {
    private val SHAPE = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    private val TYPOS = mapOf(
        "gamil.com" to "gmail.com", "gmial.com" to "gmail.com", "gmal.com" to "gmail.com", "gnail.com" to "gmail.com",
        "hotmial.com" to "hotmail.com", "hotmal.com" to "hotmail.com", "yaho.com" to "yahoo.com", "yahooo.com" to "yahoo.com",
        "outlok.com" to "outlook.com", "iclod.com" to "icloud.com",
    )

    fun isValid(email: String): Boolean = email.length in 3..254 && SHAPE.matches(email)

    /** The corrected address when the domain is a known typo (`.con` -> `.com`), else null. */
    fun suggestion(email: String): String? {
        val at = email.lastIndexOf('@')
        if (at <= 0) return null
        val domain = email.substring(at + 1).lowercase()
        TYPOS[domain]?.let { return email.substring(0, at + 1) + it }
        if (domain.endsWith(".con")) return email.substring(0, at + 1) + domain.removeSuffix(".con") + ".com"
        return null
    }

    /** The error to show, or null when the address looks fine. */
    fun check(email: String): WatchdogException? {
        if (!isValid(email)) return WatchdogException("invalid_email", userMessage = "Enter the email you use for the Agent Desk.")
        suggestion(email)?.let { return WatchdogException("email_typo", userMessage = "Did you mean $it? Check the address and try again.") }
        return null
    }
}

private suspend fun HttpResponse.jsonBodyText(): String = bodyAsText()
