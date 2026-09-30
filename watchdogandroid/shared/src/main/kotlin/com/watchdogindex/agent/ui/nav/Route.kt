package com.watchdogindex.agent.ui.nav

import com.watchdogindex.agent.core.model.ClientFilter

/** Every destination in the app. The Android app maps these to Navigation Compose routes; the desktop preview keeps a simple back stack. */
sealed interface Route {
    data object Welcome : Route
    data object Today : Route
    /**
     * The Clients tab. [filter] pre-selects a chip the way the web's `clients?filter=checkup` does (Today's "Review"
     * task, the Alerts "Send checkups" action, a deep link); null opens the tab on its own state.
     */
    data class Clients(val filter: ClientFilter? = null) : Route
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
    Clients("Clients", "group", Route.Clients()),
    Farm("Farm", "map", Route.Farm),
    Marketing("Marketing", "campaign", Route.Marketing),
}

/** The navigation bar destination a route belongs to, whatever arguments it carries (a filtered Clients route is still the Clients tab). */
fun Route.tab(): Tab? = when (this) {
    is Route.Clients -> Tab.Clients
    else -> Tab.entries.firstOrNull { it.route == this }
}

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
