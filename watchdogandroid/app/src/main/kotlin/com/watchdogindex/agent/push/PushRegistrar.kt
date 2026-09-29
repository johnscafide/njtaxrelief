package com.watchdogindex.agent.push

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.watchdogindex.agent.BuildConfig
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.tasks.await

/** What the app knows about push on this install. [configured] is false until a google-services.json ships. */
data class PushState(
    val configured: Boolean,
    /** True once the current FCM token has been accepted by AlertsRepository.registerPushToken. */
    val registered: Boolean = false,
    val lastError: String? = null,
)

/**
 * Fetches the FCM registration token and hands it to [Repositories.alerts]. Every Firebase call is guarded by
 * [isConfigured]: without google-services.json the Google Services plugin is not applied, Firebase never
 * initialises, and this class only reports `configured = false` so Settings can say push is not set up.
 */
class PushRegistrar(context: Context, private val repos: Repositories) {
    private val appContext = context.applicationContext
    private val _state = MutableStateFlow(PushState(configured = computeConfigured()))
    val state: StateFlow<PushState> = _state.asStateFlow()

    /** Firebase is compiled in but only live when the plugin generated its resources and the default app exists. */
    val isConfigured: Boolean get() = _state.value.configured

    /** The token last registered in this process; never persisted by the app. */
    @Volatile private var currentToken: String? = null

    private fun computeConfigured(): Boolean {
        if (!BuildConfig.FIREBASE_CONFIGURED) return false
        return try { FirebaseApp.getApps(appContext).isNotEmpty() } catch (e: Exception) { false }
    }

    /** Called when the agent is signed in: fetch the token and register it. Returns whether registration succeeded. */
    suspend fun register(): Boolean {
        if (!isConfigured) return false
        val token = try {
            FirebaseMessaging.getInstance().token.await()
        } catch (e: Exception) {
            Log.w(TAG, "FCM token unavailable", e)
            _state.update { it.copy(registered = false, lastError = e.message) }
            return false
        }
        return registerToken(token)
    }

    /** Registers a token that Firebase just issued or rotated (also called from WatchdogMessagingService.onNewToken). */
    suspend fun registerToken(token: String): Boolean {
        if (token.isBlank()) return false
        return try {
            repos.alerts.registerPushToken(token, PLATFORM)
            currentToken = token
            _state.update { it.copy(registered = true, lastError = null) }
            true
        } catch (e: Exception) {
            // Not signed in yet, offline, or the backend refused: keep the token and retry on the next sign-in.
            Log.w(TAG, "Push token registration failed", e)
            _state.update { it.copy(registered = false, lastError = e.message) }
            false
        }
    }

    /** Tells the backend to stop sending to this install. Call before the session is discarded (needs auth). */
    suspend fun unregister() {
        val token = currentToken ?: return
        try {
            repos.alerts.unregisterPushToken(token)
        } catch (e: Exception) {
            Log.w(TAG, "Push token unregistration failed", e)
        } finally {
            currentToken = null
            _state.update { it.copy(registered = false) }
        }
    }

    companion object {
        const val PLATFORM = "android"
        private const val TAG = "WatchdogPush"
    }
}
