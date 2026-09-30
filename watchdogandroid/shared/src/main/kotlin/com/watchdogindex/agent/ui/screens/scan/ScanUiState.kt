package com.watchdogindex.agent.ui.screens.scan

import com.watchdogindex.agent.core.model.ScanHistoryItem
import com.watchdogindex.agent.core.model.ScanResult

/** The two ways in: the sign's QR code through the camera, or a pasted listing link. */
enum class ScanMode { Camera, Paste }

/** Why a lookup failed, so the screen can pick the right icon, wording and recovery action. */
enum class ScanErrorKind { UnsupportedLink, NotFound, Network, Other }

data class ScanError(val kind: ScanErrorKind, val message: String)

sealed interface ScanUiState {
    data object Loading : ScanUiState

    data class Ready(
        val mode: ScanMode,
        /** False on desktop and on devices without a camera: the Camera segment then explains itself. */
        val hasCamera: Boolean,
        /** The listing link as shown in the field (scheme and "www." dropped for readability). */
        val url: String,
        /** A lookup is in flight. */
        val resolving: Boolean = false,
        /** The last successful lookup, shown as the result panel (inline in paste mode, in a sheet from the camera). */
        val result: ScanResult? = null,
        val error: ScanError? = null,
        /** The result's home is saved to the agent's clients. */
        val saved: Boolean = false,
        /** The true cost card is being built for the share sheet. */
        val sharing: Boolean = false,
        val torch: Boolean = false,
        /** The camera result sheet is open. */
        val sheetOpen: Boolean = false,
        val historyOpen: Boolean = false,
        val historyLoading: Boolean = false,
        /** Null until the history sheet is first opened. */
        val history: List<ScanHistoryItem>? = null,
        /** Why the history could not be loaded, shown inside the sheet with a retry; null once a load lands. */
        val historyError: String? = null,
        /** A one-off message for the snackbar. */
        val notice: String? = null,
    ) : ScanUiState
}
