package com.watchdogindex.agent.android

import android.app.Activity
import android.content.Context
import android.os.Build
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.watchdogindex.agent.BuildConfig
import com.watchdogindex.agent.core.WatchdogException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.lang.ref.WeakReference

/** The signed WebAuthn assertion the backend verifies. [responseJson] is the PublicKeyCredential JSON as returned by Credential Manager. */
class PasskeyAssertion(val responseJson: String)

/**
 * A thin wrapper over Credential Manager for passkey sign-in. It only does the device half: given the server's
 * challenge (the PublicKeyCredentialRequestOptions JSON), it asks the platform for an assertion and returns the
 * response JSON for the server to verify.
 *
 * The Watchdog backend has no WebAuthn endpoints today (Docs: auth-and-account, section 3.2), so
 * [BuildConfig.PASSKEYS_ENABLED] is false, [isAvailable] is false, the Welcome screen hides the button and nothing
 * here runs. When the backend gains passkeys, the AuthRepository implementation calls [assert] between its
 * challenge and verify requests, and the flag is flipped in app/build.gradle.kts.
 */
object PasskeyBridge {
    private var activityRef: WeakReference<Activity>? = null

    /** MainActivity registers itself so a repository (which has no Activity) can start the system passkey sheet. */
    fun attach(activity: Activity) { activityRef = WeakReference(activity) }

    fun detach(activity: Activity) { if (activityRef?.get() === activity) activityRef = null }

    /** True when the feature flag is on and the OS has the passkey-capable Credential Manager provider path (API 28+). */
    val isAvailable: Boolean
        get() = BuildConfig.PASSKEYS_ENABLED && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P

    /** Requests an assertion using the attached activity. */
    suspend fun assert(requestJson: String): PasskeyAssertion {
        val activity = activityRef?.get()
            ?: throw WatchdogException("No foreground activity for passkey sign-in", userMessage = "Open Watchdog and try the passkey again.")
        return assert(activity, requestJson)
    }

    /** Requests an assertion for [requestJson] (the server challenge) with [activity] as the UI host. */
    suspend fun assert(activity: Activity, requestJson: String): PasskeyAssertion {
        if (!isAvailable) throw WatchdogException("Passkeys are not enabled", userMessage = "Passkeys aren't available yet. Continue with email.")
        val manager = CredentialManager.create(activity as Context)
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetPublicKeyCredentialOption(requestJson))
            .build()
        return withContext(Dispatchers.Main.immediate) {
            try {
                val response = manager.getCredential(context = activity, request = request)
                val credential = response.credential as? PublicKeyCredential
                    ?: throw WatchdogException("Unexpected credential type", userMessage = "That wasn't a passkey. Try again or continue with email.")
                PasskeyAssertion(credential.authenticationResponseJson)
            } catch (e: GetCredentialCancellationException) {
                throw WatchdogException("Passkey sign-in cancelled", e, userMessage = "Passkey sign-in was cancelled.")
            } catch (e: NoCredentialException) {
                throw WatchdogException("No passkey on this device", e, userMessage = "No passkey for Watchdog on this phone. Continue with email.")
            } catch (e: GetCredentialException) {
                throw WatchdogException("Passkey sign-in failed: ${e.type}", e, userMessage = "Passkey sign-in didn't work. Continue with email.")
            }
        }
    }
}
