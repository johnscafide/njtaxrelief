package com.watchdogindex.agent.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.font.FontFamily
import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.model.AppThemeMode
import com.watchdogindex.agent.core.repo.Repositories
import com.watchdogindex.agent.design.ThemeMode
import com.watchdogindex.agent.design.WatchdogTheme
import com.watchdogindex.agent.platform.LocalPlatformServices
import com.watchdogindex.agent.platform.PlatformServices

/**
 * The object graph a screen can reach: repositories (live or sample), platform services and the font.
 * Built once by the Android app (WatchdogApplication) and by the desktop preview.
 */
interface AppGraph {
    val repos: Repositories
    val platform: PlatformServices
    val fontFamily: FontFamily

    /** The backend and site configuration the repositories run against; screens take public site links from `config.links`. */
    val config: WatchdogConfig get() = WatchdogConfig.Production
}

val LocalAppGraph = staticCompositionLocalOf<AppGraph> { error("No AppGraph provided") }

fun AppThemeMode.toThemeMode(): ThemeMode = when (this) {
    AppThemeMode.System -> ThemeMode.System
    AppThemeMode.Light -> ThemeMode.Light
    AppThemeMode.Dark -> ThemeMode.Dark
}

/** Root of the shared UI: provides the graph, platform services and the theme around [content]. */
@Composable
fun WatchdogApp(graph: AppGraph, themeMode: ThemeMode, reducedMotion: Boolean = false, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalAppGraph provides graph, LocalPlatformServices provides graph.platform) {
        WatchdogTheme(mode = themeMode, fontFamily = graph.fontFamily, reducedMotion = reducedMotion, content = content)
    }
}
