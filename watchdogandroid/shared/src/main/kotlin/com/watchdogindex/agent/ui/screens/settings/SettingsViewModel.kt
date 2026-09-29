package com.watchdogindex.agent.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppThemeMode
import com.watchdogindex.agent.core.model.QuietHours
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Settings: the agent's account, the Monday email and alert channels (AlertsRepository), quiet hours, the
 * theme (SettingsRepository, applied by the host) and sign-out. Switches flip immediately and revert with a
 * notice if the repository rejects the change.
 */
class SettingsViewModel(private val repos: Repositories) : ViewModel() {

    /** What this screen owns on top of the repositories' own flows. */
    private data class Local(
        val account: Account? = null,
        /** The preferences as shown: the repository's value, or the optimistic copy while a save is in flight. */
        val preferences: AlertPreferences? = null,
        val dialog: SettingsDialog? = null,
        val notice: String? = null,
        val failure: String? = null,
        val loading: Boolean = true,
        val signingOut: Boolean = false,
        val signedOut: Boolean = false,
    )

    private val local = MutableStateFlow(Local())

    private val _state = MutableStateFlow<SettingsUiState>(SettingsUiState.Loading)
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    init {
        repos.alerts.preferences
            .onEach { fresh -> local.update { it.copy(preferences = fresh) } }
            .launchIn(viewModelScope)
        combine(local, repos.settings.settings) { l, settings ->
            when {
                l.failure != null -> SettingsUiState.Error(l.failure)
                l.loading || l.account == null || l.preferences == null -> SettingsUiState.Loading
                else -> SettingsUiState.Ready(
                    account = l.account,
                    preferences = l.preferences,
                    settings = settings,
                    dialog = l.dialog,
                    notice = l.notice,
                    signingOut = l.signingOut,
                    signedOut = l.signedOut,
                )
            }
        }.onEach { _state.value = it }.launchIn(viewModelScope)
        load()
    }

    /** Loads the account and the latest alert preferences; also the retry from the error state. */
    fun load() {
        local.update { it.copy(loading = true, failure = null) }
        viewModelScope.launch {
            try {
                repos.alerts.refresh()
                val account = repos.auth.account()
                local.update { it.copy(account = account, loading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                local.update { it.copy(loading = false, failure = e.friendlyMessage()) }
            }
        }
    }

    // ------------------------------------------------------------------ Monday email and alerts

    fun setMondayEmail(on: Boolean) = savePreferences { it.copy(mondayEmail = on) }

    fun setMondayNotification(on: Boolean) = savePreferences { it.copy(mondayNotification = on) }

    fun setChannel(channel: AlertChannel, on: Boolean) = savePreferences { it.copy(channels = it.channels + (channel to on)) }

    // ------------------------------------------------------------------ dialogs

    fun openQuietHours() {
        val current = local.value.preferences?.quietHours ?: return
        local.update { it.copy(dialog = SettingsDialog.QuietHours(current.startHour, current.endHour)) }
    }

    fun adjustQuietStart(deltaHours: Int) = updateQuietHoursDialog { it.copy(startHour = wrapHour(it.startHour + deltaHours)) }

    fun adjustQuietEnd(deltaHours: Int) = updateQuietHoursDialog { it.copy(endHour = wrapHour(it.endHour + deltaHours)) }

    fun saveQuietHours() {
        val dialog = local.value.dialog as? SettingsDialog.QuietHours ?: return
        closeDialog()
        savePreferences { it.copy(quietHours = QuietHours(dialog.startHour, dialog.endHour)) }
    }

    fun openTheme() = local.update { it.copy(dialog = SettingsDialog.Theme) }

    fun openAccount() = local.update { it.copy(dialog = SettingsDialog.Account) }

    fun closeDialog() = local.update { it.copy(dialog = null) }

    /** Persists the theme; the host observes the settings repository and re-themes the whole app. */
    fun setTheme(mode: AppThemeMode) {
        closeDialog()
        viewModelScope.launch {
            try {
                repos.settings.update { it.copy(themeMode = mode) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                local.update { it.copy(notice = e.friendlyMessage()) }
            }
        }
    }

    // ------------------------------------------------------------------ account

    fun signOut() {
        if (local.value.signingOut) return
        local.update { it.copy(signingOut = true, dialog = null) }
        viewModelScope.launch {
            try {
                repos.auth.signOut()
                local.update { it.copy(signingOut = false, signedOut = true) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                local.update { it.copy(signingOut = false, notice = e.friendlyMessage()) }
            }
        }
    }

    /** Called by the screen once the snackbar has shown the notice. */
    fun clearNotice() = local.update { it.copy(notice = null) }

    // ------------------------------------------------------------------ helpers

    private fun savePreferences(transform: (AlertPreferences) -> AlertPreferences) {
        val before = local.value.preferences ?: return
        val after = transform(before)
        if (after == before) return
        local.update { it.copy(preferences = after) }
        viewModelScope.launch {
            try {
                repos.alerts.update(after)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                local.update { it.copy(preferences = repos.alerts.preferences.value, notice = e.friendlyMessage()) }
            }
        }
    }

    private inline fun updateQuietHoursDialog(transform: (SettingsDialog.QuietHours) -> SettingsDialog.QuietHours) {
        local.update { l ->
            val dialog = l.dialog as? SettingsDialog.QuietHours ?: return@update l
            l.copy(dialog = transform(dialog))
        }
    }

    private fun wrapHour(hour: Int): Int = ((hour % 24) + 24) % 24

    private fun Exception.friendlyMessage(): String =
        (this as? WatchdogException)?.userMessage ?: "Something went wrong. Try again."
}
