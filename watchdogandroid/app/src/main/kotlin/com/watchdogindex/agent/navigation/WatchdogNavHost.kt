package com.watchdogindex.agent.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.watchdogindex.agent.app.AppGraph
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.ui.nav.Navigator
import com.watchdogindex.agent.ui.nav.Route
import com.watchdogindex.agent.ui.nav.ScreenHost
import com.watchdogindex.agent.ui.nav.Tab
import com.watchdogindex.agent.ui.nav.tab

/**
 * Navigation Compose host for every [Route]. The start destination is Welcome when signed out and Today when
 * signed in; the host then follows the auth state (sign-in replaces Welcome with Today, sign-out clears the
 * stack back to Welcome). Tab switches keep one saved back stack per tab under Today, the home tab.
 * Navigation 2.8 animates predictive back with the pop transitions declared here.
 *
 * [pendingRoute] is a deep link, share or notification target from MainActivity; it opens once the agent is
 * signed in and is then cleared through [onPendingRouteConsumed].
 */
@Composable
fun WatchdogNavHost(
    graph: AppGraph,
    pendingRoute: Route?,
    onPendingRouteConsumed: () -> Unit,
    onExit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()
    val authState by graph.repos.auth.state.collectAsStateWithLifecycle()
    // The collected state is seeded from the same StateFlow value, so it picks the same start screen as a direct
    // `.value` read would, without reading a StateFlow value in composition (a lint error in CI).
    val startDestination = remember { if (authState is AuthState.SignedIn) RouteNames.TODAY else RouteNames.WELCOME }
    val navigator = remember(navController) { NavControllerNavigator(navController, onExit) }

    // Sign-in and sign-out transitions.
    LaunchedEffect(authState) {
        val current = navController.currentDestination?.route
        when (authState) {
            is AuthState.SignedIn -> if (current == RouteNames.WELCOME || current == null) {
                navController.navigate(RouteNames.TODAY) {
                    popUpTo(RouteNames.WELCOME) { inclusive = true }
                    launchSingleTop = true
                }
            }
            AuthState.SignedOut -> if (current != null && current != RouteNames.WELCOME) {
                navController.navigate(RouteNames.WELCOME) {
                    // Pop the whole graph, not its start destination: after a first-run sign-in Welcome (the start
                    // destination) is no longer on the stack, and popping to a missing destination is ignored,
                    // which would leave Welcome stacked over signed-out content.
                    popUpTo(navController.graph.id) { inclusive = true }
                    launchSingleTop = true
                }
            }
            else -> Unit
        }
    }

    // Deep links wait for a session; a signed-out agent sees Welcome first and lands on the target afterwards.
    val signedIn = authState is AuthState.SignedIn
    LaunchedEffect(pendingRoute, signedIn) {
        val route = pendingRoute ?: return@LaunchedEffect
        if (!signedIn) return@LaunchedEffect
        navigator.open(route)
        onPendingRouteConsumed()
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier.fillMaxSize(),
        enterTransition = { fadeIn(animationSpec = tween(220)) },
        exitTransition = { fadeOut(animationSpec = tween(180)) },
        popEnterTransition = { fadeIn(animationSpec = tween(220)) },
        popExitTransition = { fadeOut(animationSpec = tween(180)) },
    ) {
        composable(RouteNames.WELCOME) { ScreenHost(Route.Welcome, navigator) }
        composable(RouteNames.TODAY) { ScreenHost(Route.Today, navigator) }
        composable(
            route = RouteNames.CLIENTS,
            arguments = listOf(navArgument(RouteNames.ARG_FILTER) { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            // "clients" (the tab switch) and "clients?filter=checkup" (Today's Review task, a deep link) share this entry.
            ScreenHost(Route.Clients(RouteNames.clientFilterOf(entry.arguments?.getString(RouteNames.ARG_FILTER))), navigator)
        }
        composable(RouteNames.FARM) { ScreenHost(Route.Farm, navigator) }
        composable(RouteNames.MARKETING) { ScreenHost(Route.Marketing, navigator) }
        composable(
            route = RouteNames.PROPERTY,
            arguments = listOf(navArgument(RouteNames.ARG_PIN) { type = NavType.StringType }),
        ) { entry ->
            val pin = entry.arguments?.getString(RouteNames.ARG_PIN).orEmpty()
            ScreenHost(Route.Property(pin), navigator)
        }
        composable(
            route = RouteNames.SCAN,
            arguments = listOf(navArgument(RouteNames.ARG_URL) { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            ScreenHost(Route.Scan(entry.arguments?.getString(RouteNames.ARG_URL)), navigator)
        }
        composable(RouteNames.INTELLIGENCE) { ScreenHost(Route.Intelligence, navigator) }
        composable(RouteNames.ALERTS) { ScreenHost(Route.Alerts, navigator) }
        composable(RouteNames.SETTINGS) { ScreenHost(Route.Settings, navigator) }
        composable(
            route = RouteNames.SEARCH,
            arguments = listOf(navArgument(RouteNames.ARG_QUERY) { type = NavType.StringType; defaultValue = "" }),
        ) { entry ->
            ScreenHost(Route.Search(entry.arguments?.getString(RouteNames.ARG_QUERY).orEmpty()), navigator)
        }
    }
}

/**
 * [Navigator] on a NavHostController. Tab switches pop to Today saving state, restore the target tab's saved
 * stack and never stack duplicates; other routes push. Back pops, and closes the activity from the root.
 *
 * A tab route that carries arguments (Clients with a filter) also switches tabs, but with its own route string
 * and without restoring the tab's saved stack: a fresh Clients entry opens on the filter, or, when Clients is
 * already on top, single-top replaces the entry's arguments and the screen re-selects the chip.
 */
class NavControllerNavigator(
    private val controller: NavHostController,
    private val onExit: () -> Unit,
) : Navigator {

    override fun open(route: Route) {
        if (route == Route.Welcome) {
            controller.navigate(RouteNames.WELCOME) {
                // Same as sign-out in WatchdogNavHost: clear the whole graph so Welcome is the only entry.
                popUpTo(controller.graph.id) { inclusive = true }
                launchSingleTop = true
            }
            return
        }
        val tab = route.tab()
        if (tab != null) {
            navigateToTab(RouteNames.of(route), restoreSavedStack = route == tab.route)
            return
        }
        controller.navigate(RouteNames.of(route)) {
            // Screens that are singletons in the flow do not stack; property and search pages do, so an agent
            // can step back through the homes they looked at.
            launchSingleTop = route is Route.Scan || route == Route.Intelligence || route == Route.Alerts || route == Route.Settings
        }
    }

    override fun back() {
        if (!controller.popBackStack()) onExit()
    }

    override fun switchTab(tab: Tab) = navigateToTab(RouteNames.of(tab.route), restoreSavedStack = true)

    private fun navigateToTab(routeString: String, restoreSavedStack: Boolean) {
        val leavingWelcome = controller.currentDestination?.route == RouteNames.WELCOME
        controller.navigate(routeString) {
            if (leavingWelcome) {
                popUpTo(RouteNames.WELCOME) { inclusive = true }
            } else {
                popUpTo(RouteNames.TODAY) { saveState = true }
            }
            launchSingleTop = true
            restoreState = restoreSavedStack
        }
    }
}
