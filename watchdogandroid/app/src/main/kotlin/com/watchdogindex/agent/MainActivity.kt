package com.watchdogindex.agent

import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.toArgb
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.watchdogindex.agent.android.AndroidVoiceSession
import com.watchdogindex.agent.android.PasskeyBridge
import com.watchdogindex.agent.app.WatchdogApp
import com.watchdogindex.agent.app.toThemeMode
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.design.ThemeMode
import com.watchdogindex.agent.design.WatchdogDarkColors
import com.watchdogindex.agent.design.WatchdogLightColors
import com.watchdogindex.agent.navigation.IntentRoutes
import com.watchdogindex.agent.navigation.WatchdogNavHost
import com.watchdogindex.agent.push.PushPayload
import com.watchdogindex.agent.push.WatchdogMessagingService
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.screens.intelligence.LocalVoiceSession

/**
 * The single activity. Installs the splash, goes edge to edge with bar icons and a window background that follow
 * the app theme (not only the system theme, since Settings can force light or dark), and hosts the Navigation
 * Compose graph once the stored session has been restored. Incoming intents (share target, App Links, watchdog://
 * links, notification taps) become a pending [Route] that the host opens once the agent is signed in.
 * Notification intents also clear the alert they came from and, for a "Call client" action with a number, start
 * the dialer. Watchdog Intelligence Voice ([AndroidVoiceSession]) is created per activity, because the microphone
 * permission prompt needs this activity's result registry, and provided to the shared UI at the root.
 */
class MainActivity : ComponentActivity() {
    private var pendingRoute by mutableStateOf<Route?>(null)
    private var voiceSession: AndroidVoiceSession? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        val app = application as WatchdogApplication
        val graph = app.graph
        graph.platform.attach(this)
        PasskeyBridge.attach(this)
        val voice = AndroidVoiceSession(this).also { voiceSession = it }
        enableEdgeToEdge()

        // Hold the splash until the stored session has been restored, but never longer than 2.5 s.
        val splashStart = SystemClock.elapsedRealtime()
        splash.setKeepOnScreenCondition {
            val restored = app.sessionRestored.value && graph.repos.auth.state.value !is AuthState.Unknown
            // Kotlin reads a line that starts with "!" as a continuation of the previous "!is", so keep the
            // condition in a named value.
            val stillWaiting = !restored && SystemClock.elapsedRealtime() - splashStart < SPLASH_MAX_MILLIS
            stillWaiting
        }

        if (savedInstanceState == null) pendingRoute = consumeLaunchIntent(intent)

        val reducedMotion = animationsDisabled()

        setContent {
            val settings by graph.repos.settings.settings.collectAsStateWithLifecycle()
            val sessionRestored by app.sessionRestored.collectAsStateWithLifecycle()
            val themeMode = settings.themeMode.toThemeMode()
            val dark = when (themeMode) {
                ThemeMode.System -> isSystemInDarkTheme()
                ThemeMode.Light -> false
                ThemeMode.Dark -> true
            }
            LaunchedEffect(dark) {
                enableEdgeToEdge(
                    statusBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                    navigationBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                )
                // themes.xml can only follow the system night mode. When Settings forces the other theme the window
                // itself has to match, or it shows through as a wrong-coloured flash behind screen transitions, the
                // IME, activity recreation and the moment before the graph is composed.
                window.setBackgroundDrawable(ColorDrawable((if (dark) WatchdogDarkColors else WatchdogLightColors).bg.toArgb()))
            }
            WatchdogApp(graph = graph, themeMode = themeMode, reducedMotion = reducedMotion) {
                // The Intelligence screen reads LocalVoiceSession; without a host value the shared default,
                // NoVoiceSession, says Watchdog Intelligence Voice is not ready on this device.
                CompositionLocalProvider(LocalVoiceSession provides voice) {
                    WatchdogNavHost(
                        graph = graph,
                        pendingRoute = pendingRoute,
                        onPendingRouteConsumed = { pendingRoute = null },
                        onExit = { finish() },
                        sessionRestored = sessionRestored,
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeLaunchIntent(intent)?.let { pendingRoute = it }
    }

    override fun onDestroy() {
        val app = application as? WatchdogApplication
        app?.graph?.platform?.detach(this)
        PasskeyBridge.detach(this)
        voiceSession?.release()
        voiceSession = null
        super.onDestroy()
    }

    /** Reduced motion: the system animator scale is 0 (Settings > Accessibility > Remove animations, or developer options). */
    private fun animationsDisabled(): Boolean = try {
        Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    } catch (e: Exception) {
        !ValueAnimator.areAnimatorsEnabled()
    }

    /**
     * Everything an incoming intent asks for besides navigation: clears the alert whose tap or action button
     * opened the app (action buttons do not auto-cancel) and dials the client when a "Call client" button carried
     * a phone number, then returns the route to open. An intent replayed from Recents is ignored, so a
     * notification action is never repeated by reopening the task.
     */
    private fun consumeLaunchIntent(intent: Intent?): Route? {
        if (intent == null) return null
        if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return null
        val notificationId = intent.getIntExtra(WatchdogMessagingService.EXTRA_NOTIFICATION_ID, -1)
        if (notificationId >= 0) WatchdogMessagingService.cancelAlert(this, notificationId)
        intent.getStringExtra(WatchdogMessagingService.EXTRA_DIAL_PHONE)?.takeIf { it.isNotBlank() }?.let { phone ->
            (application as WatchdogApplication).graph.platform.dial(phone)
        }
        return intent.toRoute()
    }

    /**
     * The app's own notification intents carry the namespaced extras. A push the system rendered itself (one with a
     * `notification` block that arrived while the app was in the background) delivers its data map as bare extras
     * on the launcher intent instead, so those keys are read as the fallback (see [PushPayload]).
     */
    private fun Intent.toRoute(): Route? = IntentRoutes.parse(
        action = action,
        dataString = dataString,
        sharedText = if (action == Intent.ACTION_SEND) getStringExtra(Intent.EXTRA_TEXT) else null,
        extraPin = getStringExtra(IntentRoutes.EXTRA_PIN)
            ?: PushPayload.pinOf(getStringExtra(PushPayload.KEY_PIN), getStringExtra(PushPayload.KEY_PAMS_PIN)),
        extraRoute = getStringExtra(IntentRoutes.EXTRA_ROUTE) ?: getStringExtra(PushPayload.KEY_ROUTE),
    )

    private companion object {
        const val SPLASH_MAX_MILLIS = 2_500L
    }
}
