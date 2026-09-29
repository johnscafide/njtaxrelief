package com.watchdogindex.agent.core.model

enum class AppThemeMode { System, Light, Dark }

data class AppSettings(
    val themeMode: AppThemeMode = AppThemeMode.System,
    val hasSeenWelcome: Boolean = false,
    val extensionKeyEnabled: Boolean = false,
)
