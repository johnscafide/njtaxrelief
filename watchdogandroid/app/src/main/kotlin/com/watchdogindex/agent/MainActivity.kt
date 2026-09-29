package com.watchdogindex.agent

import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.watchdogindex.agent.android.PasskeyBridge
import com.watchdogindex.agent.app.WatchdogApp
import com.watchdogindex.agent.app.toThemeMode
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.design.ThemeMode
import com.watchdogindex.agent.navigation.IntentRoutes
import com.watchdogindex.agent.navigation.WatchdogNavHost
import com.watchdogindex.agent.ui.nav.Route

/**
 * The single activity. Installs the splash, goes edge to edge with bar icons that follow the app theme (not
 * only the system theme, since Settings can force light or dark), and hosts the Navigation Compose graph.
 * Incoming intents (share target, App Links, watchdog:// links, notification taps) become a pending [Route]
 * that the host opens once the agent is signed in.
 */
class MainActivity : ComponentActivity() {
    private var pendingRoute by mutableStateOf<Route?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        val app = application as WatchdogApplication
        val graph = app.graph
        graph.platform.attach(this)
        PasskeyBridge.attach(this)
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

        if (savedInstanceState == null) pendingRoute = intent?.toRoute()

        val reducedMotion = animationsDisabled()

        setContent {
            val settings by graph.repos.settings.settings.collectAsStateWithLifecycle()
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
            }
            WatchdogApp(graph = graph, themeMode = themeMode, reducedMotion = reducedMotion) {
                WatchdogNavHost(
                    graph = graph,
                    pendingRoute = pendingRoute,
                    onPendingRouteConsumed = { pendingRoute = null },
                    onExit = { finish() },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.toRoute()?.let { pendingRoute = it }
    }

    override fun onDestroy() {
        val app = application as? WatchdogApplication
        app?.graph?.platform?.detach(this)
        PasskeyBridge.detach(this)
        super.onDestroy()
    }

    /** Reduced motion: the system animator scale is 0 (Settings > Accessibility > Remove animations, or developer options). */
    private fun animationsDisabled(): Boolean = try {
        Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    } catch (e: Exception) {
        !ValueAnimator.areAnimatorsEnabled()
    }

    private fun Intent.toRoute(): Route? = IntentRoutes.parse(
        action = action,
        dataString = dataString,
        sharedText = if (action == Intent.ACTION_SEND) getStringExtra(Intent.EXTRA_TEXT) else null,
        extraPin = getStringExtra(IntentRoutes.EXTRA_PIN),
        extraRoute = getStringExtra(IntentRoutes.EXTRA_ROUTE),
    )

    private companion object {
        const val SPLASH_MAX_MILLIS = 2_500L
    }
}
