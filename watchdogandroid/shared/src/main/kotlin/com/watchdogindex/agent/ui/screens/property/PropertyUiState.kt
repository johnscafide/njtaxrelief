package com.watchdogindex.agent.ui.screens.property

import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.model.PropertyDetail

sealed interface PropertyUiState {
    data object Loading : PropertyUiState

    data class Ready(
        val detail: PropertyDetail,
        /** Saved to the agent's clients (the bookmark in the top bar and the "Save to client" action). */
        val saved: Boolean,
        /** On the agent's watch list (the "Watch this home" menu item). */
        val watched: Boolean,
        /** The more_vert dropdown is open. */
        val menuOpen: Boolean = false,
        /** The true cost card is being built for the share sheet. */
        val sharing: Boolean = false,
        /** The checkup link is being fetched for the email draft. */
        val sendingCheckup: Boolean = false,
        /** A one-off message for the snackbar (saved, removed, or why an action failed). */
        val notice: String? = null,
    ) : PropertyUiState

    /** The PIN names no parcel Watchdog knows. */
    data class NotFound(val pin: PamsPin) : PropertyUiState

    data class Error(val userMessage: String) : PropertyUiState
}
