package com.watchdogindex.agent.ui.screens.property

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.PropertyApi
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.model.PropertyDetail
import com.watchdogindex.agent.core.model.ScoreCard
import com.watchdogindex.agent.core.repo.Repositories
import com.watchdogindex.agent.platform.PlatformServices
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Property detail: loads the parcel through [Repositories.properties], keeps the saved / watched toggles
 * optimistic (they revert with a notice when the repository refuses), and runs the three sharing flows
 * through [PlatformServices]: the true cost card (built by the marketing repository, then the share sheet),
 * the tax checkup (the public checkup link in an email draft) and the plain property link.
 */
class PropertyViewModel(
    private val repos: Repositories,
    private val platform: PlatformServices,
    private val pin: PamsPin,
) : ViewModel() {

    private val _state = MutableStateFlow<PropertyUiState>(PropertyUiState.Loading)
    val state: StateFlow<PropertyUiState> = _state.asStateFlow()

    init {
        load()
    }

    /** Loads the detail; also the retry from the error state. A malformed PIN is "not found" without a call. */
    fun load() {
        _state.value = PropertyUiState.Loading
        if (Format.parsePin(pin) == null) {
            _state.value = PropertyUiState.NotFound(pin)
            return
        }
        viewModelScope.launch {
            try {
                val detail = repos.properties.detail(pin)
                _state.value = PropertyUiState.Ready(detail = detail, saved = detail.isSaved, watched = detail.isWatched)
            } catch (e: CancellationException) {
                throw e
            } catch (e: PropertyApi.NotFoundException) {
                _state.value = PropertyUiState.NotFound(pin)
            } catch (e: Exception) {
                _state.value = PropertyUiState.Error(e.friendlyMessage())
            }
        }
    }

    // ------------------------------------------------------------------ saved / watched

    fun toggleSaved() {
        val ready = ready() ?: return
        val saved = !ready.saved
        updateReady { it.copy(saved = saved, notice = if (saved) "Saved to your clients" else "Removed from your clients") }
        viewModelScope.launch {
            try {
                repos.properties.setSaved(pin, saved)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateReady { it.copy(saved = !saved, notice = e.friendlyMessage()) }
            }
        }
    }

    fun toggleWatched() {
        val ready = ready() ?: return
        val watched = !ready.watched
        updateReady { it.copy(watched = watched, menuOpen = false, notice = if (watched) "Watching this home" else "No longer watching this home") }
        viewModelScope.launch {
            try {
                repos.properties.setWatched(pin, watched)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateReady { it.copy(watched = !watched, notice = e.friendlyMessage()) }
            }
        }
    }

    // ------------------------------------------------------------------ menu

    fun openMenu() = updateReady { it.copy(menuOpen = true) }

    fun closeMenu() = updateReady { it.copy(menuOpen = false) }

    /** "Open on the web": the public property page on www.watchdogindex.com. */
    fun openOnWeb() {
        val detail = ready()?.detail ?: return
        updateReady { it.copy(menuOpen = false) }
        platform.openUrl(webUrl(detail))
    }

    // ------------------------------------------------------------------ sharing

    /** The top bar share: the property link with a one-line summary. */
    fun shareLink() {
        val detail = ready()?.detail ?: return
        val s = detail.summary
        val parts = mutableListOf("${s.address}, ${s.town}")
        detail.score?.let { parts += "Watchdog Score ${it.score} of 100" }
        detail.tax?.let { parts += "${it.billYear} property tax ${Format.money(it.bill)}" }
        platform.share(title = s.address, text = parts.joinToString(" · "), url = webUrl(detail))
    }

    /** "Share true cost card": builds the card with the agent's contact card, then opens the share sheet. */
    fun shareTrueCost() {
        val ready = ready() ?: return
        if (ready.sharing) return
        updateReady { it.copy(sharing = true) }
        viewModelScope.launch {
            try {
                val card = repos.marketing.trueCostCard(pin, null, true)
                val text = "${card.address}: ${Format.money(card.monthlyTotal)} a month at ${Format.money(card.inputs.price)}, " +
                    "property tax of ${Format.money(card.annualTax)} a year included. ${ScoreCard.FOOTER}"
                platform.share(title = "True cost of ${card.address}", text = text, url = card.shareUrl)
                updateReady { it.copy(sharing = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateReady { it.copy(sharing = false, notice = e.friendlyMessage()) }
            }
        }
    }

    /** "Send tax checkup": the public checkup link the agent sends under their own name, as an email draft. */
    fun sendCheckup() {
        val ready = ready() ?: return
        if (ready.sendingCheckup) return
        updateReady { it.copy(sendingCheckup = true) }
        viewModelScope.launch {
            try {
                val link = repos.properties.checkupLink(pin)
                val s = ready.detail.summary
                val subject = "Your property tax checkup for ${s.address}"
                val body = "Hi,\n\nHere is the property tax checkup for ${s.address}, ${s.town}. It shows whether the " +
                    "assessment holds up against recent sales and when an appeal would be due:\n$link\n\n${ScoreCard.FOOTER}\n"
                platform.composeEmail(null, subject, body)
                updateReady { it.copy(sendingCheckup = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateReady { it.copy(sendingCheckup = false, notice = e.friendlyMessage()) }
            }
        }
    }

    /** Called by the screen once the snackbar has shown the notice. */
    fun clearNotice() = updateReady { it.copy(notice = null) }

    // ------------------------------------------------------------------ helpers

    private fun ready(): PropertyUiState.Ready? = _state.value as? PropertyUiState.Ready

    private inline fun updateReady(transform: (PropertyUiState.Ready) -> PropertyUiState.Ready) {
        _state.update { s -> if (s is PropertyUiState.Ready) transform(s) else s }
    }

    private fun webUrl(detail: PropertyDetail): String =
        WatchdogConfig.PRODUCTION_SITE_ORIGIN + Derived.propertyPath(detail.summary.town, detail.summary.address, pin)

    private fun Exception.friendlyMessage(): String =
        (this as? WatchdogException)?.userMessage ?: "Something went wrong. Try again."
}
