package com.watchdogindex.agent.ui.screens.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppNotification
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
    ) : AlertsUiState

    data class Error(val userMessage: String) : AlertsUiState
}

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
            try {
                val notifications = repos.alerts.recent()
                _state.value = AlertsUiState.Ready(notifications = notifications, preferences = repos.alerts.preferences.value)
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                _state.value = AlertsUiState.Error(e.userMessage)
                return@launch
            } catch (e: Exception) {
                _state.value = AlertsUiState.Error("Alerts didn’t load. Try again.")
                return@launch
            }
            // The platform has no "is it granted" query, only the request, which returns at once when
            // permission is already held and otherwise asks the system. Alerts is the one screen where
            // asking on arrival is expected; the answer decides whether the banner shows.
            val granted = platform.requestNotificationPermission()
            _state.update { s -> if (s is AlertsUiState.Ready) s.copy(permissionGranted = granted) else s }
        }
    }

    /** The banner button: asks again; a refusal keeps the banner and points at the system settings. */
    fun requestPermission() {
        viewModelScope.launch {
            val granted = platform.requestNotificationPermission()
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
     * The number "Call client" dials: the phone on the client's next action for the home the alert is about.
     * Null when the alert names no home, the home is not a client, or the client list cannot be read; the
     * screen then opens the home instead. Never a public-record owner number.
     */
    suspend fun phoneFor(pin: PamsPin?): String? {
        if (pin == null) return null
        return try {
            repos.clients.overview().rows.firstOrNull { it.pin == pin }?.nextAction?.phone
        } catch (e: CancellationException) {
            throw e
        } catch (e: WatchdogException) {
            null
        }
    }
}
