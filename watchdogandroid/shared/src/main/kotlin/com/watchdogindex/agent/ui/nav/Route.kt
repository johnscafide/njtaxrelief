package com.watchdogindex.agent.ui.nav

/** Every destination in the app. The Android app maps these to Navigation Compose routes; the desktop preview keeps a simple back stack. */
sealed interface Route {
    data object Welcome : Route
    data object Today : Route
    data object Clients : Route
    data object Farm : Route
    data object Marketing : Route
    data class Property(val pin: String) : Route
    /** [initialUrl] is set when a listing link is shared to the app or pasted. */
    data class Scan(val initialUrl: String? = null) : Route
    data object Intelligence : Route
    data object Alerts : Route
    data object Settings : Route
    data class Search(val query: String = "") : Route
}

/** The four navigation bar destinations. [icon] is a Material Symbols name (filled variant when selected). */
enum class Tab(val label: String, val icon: String, val route: Route) {
    Today("Today", "home", Route.Today),
    Clients("Clients", "group", Route.Clients),
    Farm("Farm", "map", Route.Farm),
    Marketing("Marketing", "campaign", Route.Marketing),
}

fun Route.tab(): Tab? = Tab.entries.firstOrNull { it.route == this }

interface Navigator {
    fun open(route: Route)
    fun back()
    fun switchTab(tab: Tab)
}

object NoopNavigator : Navigator {
    override fun open(route: Route) {}
    override fun back() {}
    override fun switchTab(tab: Tab) {}
}
