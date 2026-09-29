package com.watchdogindex.agent.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import com.watchdogindex.agent.app.SampleAppGraph
import com.watchdogindex.agent.app.WatchdogApp
import com.watchdogindex.agent.app.toThemeMode
import com.watchdogindex.agent.design.ThemeMode
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.ui.components.LocalBottomChromeInsets
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.nav.ScreenHost
import com.watchdogindex.agent.ui.nav.Tab
import com.watchdogindex.agent.ui.preview.ScreenCatalog
import java.awt.Dimension
import javax.swing.JFrame

/*
 * The desktop preview window: the whole app on the sample data set in a phone-sized frame.
 *
 *   ./gradlew run                       (Windows: .\gradlew.bat run)
 *
 * Options are read from system properties, with environment variables as a fallback for launchers that cannot
 * pass -D flags (JAVA_TOOL_OPTIONS="-Dwatchdog.theme=dark" works everywhere):
 *   watchdog.theme     light | dark | system   (WATCHDOG_THEME)     default: the sample Settings value
 *   watchdog.signedIn  true | false            (WATCHDOG_SIGNED_IN) default: true; false starts on Welcome
 * Escape goes back, like the Android back gesture. The frame is pure app content, no toolbar.
 */
fun main() {
    val theme = option("watchdog.theme", "WATCHDOG_THEME")?.lowercase()
    val signedIn = option("watchdog.signedIn", "WATCHDOG_SIGNED_IN")?.toBooleanStrictOrNull() ?: true
    val fontFamily = DesktopFonts.plusJakartaSans()
    val graph = SampleAppGraph(DesktopPlatformServices(), fontFamily, signedIn = signedIn)
    println("[watchdog preview] Escape = back. Theme: ${theme ?: "from Settings"}. Signed in: $signedIn.")

    application {
        val navigator = remember { StackNavigator(if (signedIn) Route.Today else Route.Welcome) }
        Window(
            onCloseRequest = ::exitApplication,
            state = rememberWindowState(size = DpSize(ScreenCatalog.WIDTH_DP.dp, ScreenCatalog.HEIGHT_DP.dp)),
            title = "Watchdog preview",
            resizable = false,
            onPreviewKeyEvent = { event ->
                if (event.type == KeyEventType.KeyDown && event.key == Key.Escape) {
                    navigator.back()
                    true
                } else {
                    false
                }
            },
        ) {
            // The window state sizes the whole frame; grow it so the content area itself is the phone frame.
            LaunchedEffect(Unit) { fitContent(window, ScreenCatalog.WIDTH_DP, ScreenCatalog.HEIGHT_DP) }
            val settings by graph.repos.settings.settings.collectAsState()
            val mode = when (theme) {
                "light" -> ThemeMode.Light
                "dark" -> ThemeMode.Dark
                else -> settings.themeMode.toThemeMode()
            }
            val entry = navigator.current
            WatchdogApp(graph = graph, themeMode = mode) {
                PreviewHost(owner = entry) {
                    ScreenHost(entry.route, navigator)
                }
            }
        }
    }
}

private fun option(property: String, environment: String): String? =
    System.getProperty(property)?.takeIf { it.isNotBlank() } ?: System.getenv(environment)?.takeIf { it.isNotBlank() }

/** Resizes a decorated frame so its content pane is exactly [widthDp] x [heightDp] (AWT logical units are dp). */
private fun fitContent(frame: JFrame, widthDp: Int, heightDp: Int) {
    val current = frame.contentPane.size
    if (current.width == widthDp && current.height == heightDp) return
    frame.contentPane.preferredSize = Dimension(widthDp, heightDp)
    frame.pack()
}

/**
 * Everything a hosted screen needs around it that the Android app gets from its activity: a ViewModel store
 * scoped to the back-stack entry and the 24 dp gesture-bar allowance the mockups' bottom chrome assumes.
 * The screenshot harness uses the same host so the window and the renders behave alike.
 */
@Composable
fun PreviewHost(owner: ViewModelStoreOwner, content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalViewModelStoreOwner provides owner,
        LocalBottomChromeInsets provides WindowInsets(bottom = 24.dp),
    ) {
        Box(Modifier.fillMaxSize().background(WatchdogTheme.colors.bg)) { content() }
    }
}

/** One back-stack entry. It owns the ViewModels of its screen and clears them when it is popped. */
class BackStackEntry(val route: Route) : ViewModelStoreOwner {
    override val viewModelStore: ViewModelStore = ViewModelStore()
}

/**
 * The preview's navigation: a plain back stack. [switchTab] replaces the whole stack with the tab's root, the
 * way the Android app pops to the start destination; [back] on the root does nothing.
 */
class StackNavigator(start: Route) : Navigator {
    val entries = mutableStateListOf(BackStackEntry(start))

    val current: BackStackEntry get() = entries.last()

    val canGoBack: Boolean get() = entries.size > 1

    override fun open(route: Route) {
        entries.add(BackStackEntry(route))
    }

    override fun back() {
        if (entries.size <= 1) return
        entries.removeAt(entries.lastIndex).viewModelStore.clear()
    }

    override fun switchTab(tab: Tab) {
        val old = entries.toList()
        entries.clear()
        entries.add(BackStackEntry(tab.route))
        old.forEach { it.viewModelStore.clear() }
    }
}
