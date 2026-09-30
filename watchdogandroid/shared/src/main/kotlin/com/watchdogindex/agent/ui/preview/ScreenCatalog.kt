package com.watchdogindex.agent.ui.preview

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import com.watchdogindex.agent.app.AppGraph
import com.watchdogindex.agent.app.WatchdogApp
import com.watchdogindex.agent.design.ThemeMode
import com.watchdogindex.agent.ui.nav.NoopNavigator
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.nav.ScreenHost

/**
 * Every screen the harness renders, in mockup order. Ids match the reference renders
 * (android-<id>-<light|dark>.png). [fullHeightDp] renders a second, taller frame for scrolling screens so the
 * whole page can be compared, like the mockups' "-full" captures.
 */
data class CatalogEntry(
    val id: String,
    val title: String,
    val route: Route,
    val fullHeightDp: Int? = null,
)

/**
 * Lets the screenshot harness open a screen in a specific state without changing the screen's public API.
 * Screens read [LocalPreviewState] once on first composition and otherwise ignore it (it is null in the app).
 */
data class PreviewState(
    /** Marketing: open the true cost share sheet for this PIN, as the approved mockup shows it. */
    val openTrueCostSheetPin: String? = null,
    /** Scan: show the result already resolved (the mockup shows a finished paste lookup). */
    val scanResolved: Boolean = false,
)

val LocalPreviewState = staticCompositionLocalOf<PreviewState?> { null }

object ScreenCatalog {
    const val WIDTH_DP = 412
    const val HEIGHT_DP = 892
    const val DENSITY = 2.625f

    val entries: List<CatalogEntry> = listOf(
        // The passkey button is hidden until the backend supports WebAuthn (PlatformServices.supportsPasskeys is
        // false everywhere for now), so the render leaves the mockup's passkey slot empty by policy.
        CatalogEntry("welcome", "Welcome and sign in", Route.Welcome),
        CatalogEntry("today", "Today", Route.Today, fullHeightDp = 1900),
        CatalogEntry("property", "Property detail", Route.Property("0409_285.14_9"), fullHeightDp = 2340),
        // Scan and Marketing do not scroll in the mockups (no -full captures exist), so they render the frame only.
        CatalogEntry("scan", "Scan a listing", Route.Scan("https://www.zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701")),
        CatalogEntry("clients", "Clients", Route.Clients(), fullHeightDp = 1300),
        CatalogEntry("farm", "Farm map", Route.Farm),
        CatalogEntry("marketing", "Marketing with share sheet", Route.Marketing),
        CatalogEntry("intelligence", "Watchdog Intelligence brief", Route.Intelligence, fullHeightDp = 1500),
        CatalogEntry("notifications", "Alerts", Route.Alerts),
        CatalogEntry("settings", "Settings", Route.Settings, fullHeightDp = 1200),
    )
}

/** Renders one catalog entry with the sample graph in the given theme, exactly as the app would. */
@Composable
fun CatalogScreen(entry: CatalogEntry, graph: AppGraph, dark: Boolean) {
    val preview = when (entry.id) {
        "marketing" -> PreviewState(openTrueCostSheetPin = "0409_285.14_9")
        "scan" -> PreviewState(scanResolved = true)
        else -> PreviewState()
    }
    WatchdogApp(graph = graph, themeMode = if (dark) ThemeMode.Dark else ThemeMode.Light, reducedMotion = true) {
        CompositionLocalProvider(LocalPreviewState provides preview) {
            ScreenHost(entry.route, NoopNavigator)
        }
    }
}
