package com.watchdogindex.agent.ui.nav

import androidx.compose.runtime.Composable
import com.watchdogindex.agent.ui.screens.alerts.AlertsScreen
import com.watchdogindex.agent.ui.screens.clients.ClientsScreen
import com.watchdogindex.agent.ui.screens.farm.FarmScreen
import com.watchdogindex.agent.ui.screens.intelligence.IntelligenceScreen
import com.watchdogindex.agent.ui.screens.marketing.MarketingScreen
import com.watchdogindex.agent.ui.screens.property.PropertyScreen
import com.watchdogindex.agent.ui.screens.scan.ScanScreen
import com.watchdogindex.agent.ui.screens.search.SearchScreen
import com.watchdogindex.agent.ui.screens.settings.SettingsScreen
import com.watchdogindex.agent.ui.screens.today.TodayScreen
import com.watchdogindex.agent.ui.screens.welcome.WelcomeScreen

/**
 * Renders the screen for a route. Both hosts (Android Navigation Compose and the desktop preview stack)
 * call this, so screens stay navigation-agnostic: they receive a [Navigator] and nothing else about the host.
 * Tab screens draw their own navigation bar and FAB inside their Scaffold.
 */
@Composable
fun ScreenHost(route: Route, navigator: Navigator) {
    when (route) {
        Route.Welcome -> WelcomeScreen(navigator)
        Route.Today -> TodayScreen(navigator)
        is Route.Clients -> ClientsScreen(navigator, route.filter)
        Route.Farm -> FarmScreen(navigator)
        Route.Marketing -> MarketingScreen(navigator)
        is Route.Property -> PropertyScreen(route.pin, navigator)
        is Route.Scan -> ScanScreen(route.initialUrl, navigator)
        Route.Intelligence -> IntelligenceScreen(navigator)
        Route.Alerts -> AlertsScreen(navigator)
        Route.Settings -> SettingsScreen(navigator)
        is Route.Search -> SearchScreen(route.query, navigator)
    }
}
