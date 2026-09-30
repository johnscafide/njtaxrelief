package com.watchdogindex.agent.ui.screens.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppNotification
import com.watchdogindex.agent.core.model.NotificationActionKind
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.repo.Repositories
import com.watchdogindex.agent.platform.PlatformServices
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The in-app Alerts list: the same notifications the shade shows, grouped under one Watchdog header. */
sealed interface AlertsUiState {
    data object Loading : AlertsUiState

    data class Ready(
        /** Newest first, minus anything the agent dismissed with "Later" in this session. */
        val notifications: List<AppNotification>,
        /** Which switches are on, for the "what controls what" card. */
        val preferences: AlertPreferences,
        /** False shows the "Turn on notifications" banner. */
        val permissionGranted: Boolean = true,
        /** The group header's chevron collapses the list to its first alert. */
        val expanded: Boolean = true,
        /** A one-line message for the snackbar; cleared by [AlertsViewModel.clearNotice]. */
        val notice: String? = null,
        /**
         * The number "Call client" dials for each home the alerts name, resolved once per load from the client
         * list (the phone on the client's next action, never a public-record owner number). A home that is not
         * in the map opens instead of dialling.
         */
        val clientPhones: Map<PamsPin, String> = emptyMap(),
        /** True while [clientPhones] is being looked up; the "Call client" pills are disabled until it is done. */
        val resolvingPhones: Boolean = false,
    ) : AlertsUiState

    data class Error(val userMessage: String) : AlertsUiState
}

/**
 * The "notifications are off" banner follows [PlatformServices.notificationsEnabled], a read that never prompts:
 * opening Alerts (or "Try again") asks the system nothing. The only prompt is the banner's own button
 * ([requestPermission]), a deliberate tap.
 */
class AlertsViewModel(
    private val repos: Repositories,
    private val platform: PlatformServices,
) : ViewModel() {
    private val _state = MutableStateFlow<AlertsUiState>(AlertsUiState.Loading)
    val state: StateFlow<AlertsUiState> = _state.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
        // Switch changes made on the Settings screen show up here without a reload.
        viewModelScope.launch {
            repos.alerts.preferences.collect { preferences ->
                _state.update { s -> if (s is AlertsUiState.Ready) s.copy(preferences = preferences) else s }
            }
        }
    }

    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.value = AlertsUiState.Loading
            val notifications = try {
                repos.alerts.recent()
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                _state.value = AlertsUiState.Error(e.userMessage)
                return@launch
            } catch (e: Exception) {
                _state.value = AlertsUiState.Error("Alerts didn’t load. Try again.")
                return@launch
            }
            val callPins = notifications
                .filter { n -> n.actions.any { it.kind == NotificationActionKind.CallClient } }
                .mapNotNull { it.pin }
                .toSet()
            _state.value = AlertsUiState.Ready(
                notifications = notifications,
                preferences = repos.alerts.preferences.value,
                permissionGranted = notificationsEnabled(),
                resolvingPhones = callPins.isNotEmpty(),
            )
            // The list is up; nothing below may take it down: the numbers behind "Call client" follow.
            if (callPins.isNotEmpty()) {
                val phones = clientPhones(callPins)
                _state.update { s -> if (s is AlertsUiState.Ready) s.copy(clientPhones = phones, resolvingPhones = false) else s }
            }
        }
    }

    /**
     * Whether the system shows Watchdog's notifications right now, read without prompting. A platform failure
     * counts as not enabled, so the banner shows and its button, or the system settings, can put it right.
     */
    private fun notificationsEnabled(): Boolean =
        try {
            platform.notificationsEnabled()
        } catch (e: Exception) {
            false
        }

    /**
     * A platform call guarded against platform exceptions (a missing activity, a system dialog that could not be
     * shown): those return [fallback] instead of crashing.
     */
    private suspend fun guarded(fallback: Boolean, call: suspend () -> Boolean): Boolean =
        try {
            call()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            fallback
        }

    /**
     * The banner button, the app's only notification prompt: asks the system, then re-reads the switch, since a
     * granted permission with the app's notifications turned off in the system settings is still "off". A refusal
     * (or a platform failure) keeps the banner and points at the system settings.
     */
    fun requestPermission() {
        viewModelScope.launch {
            val granted = guarded(fallback = false, call = platform::requestNotificationPermission) && notificationsEnabled()
            _state.update { s ->
                if (s !is AlertsUiState.Ready) {
                    s
                } else {
                    s.copy(
                        permissionGranted = granted,
                        notice = if (granted) "Notifications are on." else "Notifications are still off for Watchdog. Turn them on in the system settings.",
                    )
                }
            }
        }
    }

    /** "Later": drops the alert from this list for the session. The shade's copy is the system's to keep. */
    fun dismiss(notificationId: String) {
        _state.update { s ->
            if (s is AlertsUiState.Ready) s.copy(notifications = s.notifications.filterNot { it.id == notificationId }) else s
        }
    }

    fun toggleExpanded() {
        _state.update { s -> if (s is AlertsUiState.Ready) s.copy(expanded = !s.expanded) else s }
    }

    fun clearNotice() {
        _state.update { s -> if (s is AlertsUiState.Ready && s.notice != null) s.copy(notice = null) else s }
    }

    /**
     * The numbers "Call client" dials for [pins], from one read of the client list: the phone on each client's
     * next action. Empty when the list cannot be read for any reason (a Watchdog error or a mapping failure in
     * the live repository; nothing may escape into the Ready list), so those alerts open the home instead.
     * Never a public-record owner number.
     */
    private suspend fun clientPhones(pins: Set<PamsPin>): Map<PamsPin, String> =
        try {
            repos.clients.overview().rows
                .mapNotNull { row ->
                    val pin = row.pin
                    val phone = row.nextAction.phone
                    if (pin != null && pin in pins && phone != null) pin to phone else null
                }
                .toMap()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emptyMap()
        }
}
