package com.watchdogindex.agent.ui.preview

import androidx.compose.runtime.Composable
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

object ScreenCatalog {
    const val WIDTH_DP = 412
    const val HEIGHT_DP = 892
    const val DENSITY = 2.625f

    val entries: List<CatalogEntry> = listOf(
        CatalogEntry("welcome", "Welcome and sign in", Route.Welcome),
        CatalogEntry("today", "Today", Route.Today, fullHeightDp = 1900),
        CatalogEntry("property", "Property detail", Route.Property("0409_285.14_9"), fullHeightDp = 2340),
        CatalogEntry("scan", "Scan a listing", Route.Scan("https://www.zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701"), fullHeightDp = 1100),
        CatalogEntry("clients", "Clients", Route.Clients, fullHeightDp = 1300),
        CatalogEntry("farm", "Farm map", Route.Farm),
        CatalogEntry("marketing", "Marketing with share sheet", Route.Marketing, fullHeightDp = 1300),
        CatalogEntry("intelligence", "Watchdog Intelligence brief", Route.Intelligence, fullHeightDp = 1500),
        CatalogEntry("notifications", "Alerts", Route.Alerts),
        CatalogEntry("settings", "Settings", Route.Settings, fullHeightDp = 1200),
    )
}

/** Renders one catalog entry with the sample graph in the given theme, exactly as the app would. */
@Composable
fun CatalogScreen(entry: CatalogEntry, graph: AppGraph, dark: Boolean) {
    WatchdogApp(graph = graph, themeMode = if (dark) ThemeMode.Dark else ThemeMode.Light, reducedMotion = true) {
        ScreenHost(entry.route, NoopNavigator)
    }
}
