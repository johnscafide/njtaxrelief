package com.watchdogindex.agent.ui.screens.settings

import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppSettings

/** A small dialog the Settings screen has open. */
sealed interface SettingsDialog {
    /** System / Light / Dark. */
    data object Theme : SettingsDialog

    /** Two hour pickers; [startHour] and [endHour] are 0..23 and only reach the repository on Save. */
    data class QuietHours(val startHour: Int, val endHour: Int) : SettingsDialog

    /** Plan, email and brokerage, with a link to the Agent Desk on the web. */
    data object Account : SettingsDialog
}

sealed interface SettingsUiState {
    data object Loading : SettingsUiState

    data class Ready(
        val account: Account,
        val preferences: AlertPreferences,
        val settings: AppSettings,
        val dialog: SettingsDialog? = null,
        /** A one-off message for the snackbar, e.g. when a switch could not be saved. */
        val notice: String? = null,
        val signingOut: Boolean = false,
        /** True once sign-out completed; the screen then opens Welcome. */
        val signedOut: Boolean = false,
    ) : SettingsUiState

    data class Error(val userMessage: String) : SettingsUiState
}
