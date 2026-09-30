package com.watchdogindex.agent.core.session

import com.watchdogindex.agent.core.NetworkException
import com.watchdogindex.agent.core.NotSignedInException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.InvalidGrantException
import com.watchdogindex.agent.core.api.SupabaseAuthClient
import com.watchdogindex.agent.core.api.TokenProvider
import com.watchdogindex.agent.core.api.TokenRefresher
import com.watchdogindex.agent.core.model.AuthSession
import com.watchdogindex.agent.core.model.AuthState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Clock

/**
 * Owns the signed-in session: the [AuthState] the UI observes, persistence through [SessionStore], proactive
 * refresh when the access token is within [REFRESH_LEEWAY_SECONDS] of expiry, and the one-recovery-attempt rule the
 * website's dashboard uses when a stored refresh token outlives its access token (auth-and-account.md section 4).
 *
 * [tokenProvider] and [refresher] plug into the HTTP layer. Everything is cleared on sign-out and when Supabase
 * answers a refresh with `invalid_grant`; a refresh that fails only because the network is down keeps the session,
 * so the app can try again later instead of signing the agent out on a bad connection.
 */
class SessionManager(
    private val auth: SupabaseAuthClient,
    private val store: SessionStore,
    private val nowEpochSeconds: () -> Long = { Clock.System.now().epochSeconds },
) {
    private val _state = MutableStateFlow<AuthState>(AuthState.Unknown)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private val refreshMutex = Mutex()

    /** The session right now, or null. */
    val session: AuthSession? get() = (_state.value as? AuthState.SignedIn)?.session

    /** Hands the HTTP layer a token that is still good for at least a minute, refreshing first when it is not. */
    val tokenProvider: TokenProvider = TokenProvider { validAccessToken() }

    /** Called by the HTTP layer after a 401: refreshes once (serialized) and returns the new token, or null. */
    val refresher: TokenRefresher = TokenRefresher { stale ->
        val current = session ?: return@TokenRefresher null
        // Another request may already have refreshed; hand back the newer token without a second round trip.
        if (current.accessToken != stale) return@TokenRefresher current.accessToken
        try {
            refreshNow(current).accessToken
        } catch (e: CancellationException) {
            throw e
        } catch (e: WatchdogException) {
            // A dead refresh token has already cleared the session; anything else leaves it for the next attempt.
            null
        }
    }

    /** Loads the stored session on launch and refreshes it when it is stale. Ends in SignedIn or SignedOut. */
    suspend fun restore() {
        val stored = store.load()
        if (stored == null) {
            _state.value = AuthState.SignedOut
            return
        }
        _state.value = AuthState.SignedIn(stored)
        if (isNearExpiry(stored)) {
            try {
                refreshNow(stored)
            } catch (e: InvalidGrantException) {
                clear()
            } catch (e: NetworkException) {
                // Offline: keep the stored session and try again on the next call.
            } catch (e: WatchdogException) {
                // Any other server trouble is not proof the session is gone.
            }
        }
    }

    suspend fun sendCode(email: String) {
        auth.signInWithOtp(email)
        _state.value = AuthState.CodeSent(SupabaseAuthClient.normalizeEmail(email))
    }

    suspend fun verifyCode(email: String, code: String) {
        val session = auth.verifyOtp(email, code)
        store.save(session)
        _state.value = AuthState.SignedIn(session)
    }

    /** Signs out on this device (`local`) or everywhere (`global`) and forgets the session either way. */
    suspend fun signOut(scope: String = "local") {
        val current = session
        try {
            if (current != null) auth.signOut(current.accessToken, scope)
        } finally {
            clear()
        }
    }

    suspend fun requireSession(): AuthSession = session ?: throw NotSignedInException()

    /** A token that is not about to expire; null when signed out. */
    suspend fun validAccessToken(): String? {
        val current = session ?: return null
        if (!isNearExpiry(current)) return current.accessToken
        return try {
            refreshNow(current).accessToken
        } catch (e: InvalidGrantException) {
            null
        } catch (e: WatchdogException) {
            // Let the request go out with what we have; the server decides, and a 401 triggers the retry path.
            current.accessToken
        }
    }

    /** Runs one refresh at a time; a caller that arrives during a refresh gets the result of that refresh. */
    suspend fun refreshNow(expected: AuthSession? = null): AuthSession = refreshMutex.withLock {
        val current = session ?: throw NotSignedInException()
        if (expected != null && current.accessToken != expected.accessToken && !isNearExpiry(current)) return current
        try {
            val fresh = auth.refresh(current.refreshToken)
            val merged = fresh.copy(
                userId = fresh.userId.ifEmpty { current.userId },
                email = fresh.email.ifEmpty { current.email },
            )
            store.save(merged)
            _state.value = AuthState.SignedIn(merged)
            merged
        } catch (e: InvalidGrantException) {
            clear()
            throw e
        }
    }

    private fun isNearExpiry(session: AuthSession): Boolean = session.expiresAtEpochSeconds - nowEpochSeconds() <= REFRESH_LEEWAY_SECONDS

    private suspend fun clear() {
        store.save(null)
        _state.value = AuthState.SignedOut
    }

    companion object {
        const val REFRESH_LEEWAY_SECONDS = 60L
    }
}
