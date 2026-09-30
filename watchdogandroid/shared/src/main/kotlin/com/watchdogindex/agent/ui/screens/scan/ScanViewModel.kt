package com.watchdogindex.agent.ui.screens.scan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.NetworkException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.ListingLinks
import com.watchdogindex.agent.core.api.PropertyApi
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.ScanHistoryItem
import com.watchdogindex.agent.core.model.ScanInput
import com.watchdogindex.agent.core.model.ScanResult
import com.watchdogindex.agent.core.model.ScoreCard
import com.watchdogindex.agent.core.model.TrueCostInputs
import com.watchdogindex.agent.core.repo.Repositories
import com.watchdogindex.agent.platform.Haptic
import com.watchdogindex.agent.platform.PlatformServices
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Scan a listing: resolves a pasted listing link or a sign's QR payload through [Repositories.scan] and
 * shows the result (score, tax, list price and the price check). Paste mode looks a link up as soon as it
 * is a Zillow, Realtor.com or Redfin listing page (or a Watchdog link / PIN); camera mode resolves the QR
 * payload and opens the result as a sheet. Errors are classified so the screen can offer the right recovery.
 *
 * [initialUrl] is set when a listing is shared to the app or the route was opened with a link; it is
 * resolved at once. [presetResolved] (the screenshot harness) also resolves at once. The platform gives
 * no location service, so QR lookups are sent without coordinates (the input keeps them optional).
 */
class ScanViewModel(
    private val repos: Repositories,
    private val platform: PlatformServices,
    initialUrl: String?,
    presetResolved: Boolean,
) : ViewModel() {

    private val _state = MutableStateFlow<ScanUiState>(ScanUiState.Loading)
    val state: StateFlow<ScanUiState> = _state.asStateFlow()

    private var resolveJob: Job? = null
    private var lastInput: ScanInput? = null

    init {
        val raw = initialUrl?.trim().orEmpty()
        val url = displayUrl(raw)
        val hasCamera = platform.hasCamera
        val mode = if (url.isNotEmpty() || !hasCamera) ScanMode.Paste else ScanMode.Camera
        _state.value = ScanUiState.Ready(mode = mode, hasCamera = hasCamera, url = url)
        // The link is classified as it arrived (scheme and all); only the field shows the shortened form.
        val input = listingInput(raw)
        when {
            input != null && (raw.isNotEmpty() || presetResolved) -> resolve(input, fromCamera = false)
            // A shared link Watchdog cannot read still deserves an answer, not an empty field.
            raw.isNotEmpty() -> unsupportedReason(raw)?.let { reason ->
                updateReady { it.copy(error = ScanError(ScanErrorKind.UnsupportedLink, reason)) }
            }
        }
    }

    // ------------------------------------------------------------------ mode

    fun setMode(mode: ScanMode) {
        updateReady { it.copy(mode = mode, torch = if (mode == ScanMode.Camera) it.torch else false, sheetOpen = false) }
    }

    fun toggleTorch() = updateReady { it.copy(torch = !it.torch) }

    // ------------------------------------------------------------------ paste mode

    /** Typing or pasting in the field. A valid listing link is looked up after a short pause. */
    fun onUrlChange(text: String) {
        val ready = ready() ?: return
        if (text == ready.url) return
        resolveJob?.cancel()
        updateReady { it.copy(url = text, result = null, error = null, resolving = false) }
        val input = listingInput(text)
        if (input != null) {
            resolveJob = viewModelScope.launch {
                delay(TYPING_PAUSE_MILLIS)
                resolve(input, fromCamera = false)
            }
        } else {
            unsupportedReason(text)?.let { reason ->
                updateReady { it.copy(error = ScanError(ScanErrorKind.UnsupportedLink, reason)) }
            }
        }
    }

    fun clearUrl() {
        resolveJob?.cancel()
        updateReady { it.copy(url = "", result = null, error = null, resolving = false) }
    }

    /** The retry on an error box: runs the last lookup again. */
    fun retry() {
        val input = lastInput ?: ready()?.let { listingInput(it.url) } ?: return
        resolve(input, fromCamera = ready()?.mode == ScanMode.Camera)
    }

    // ------------------------------------------------------------------ camera

    /** A QR code was read. Ignored while a lookup is already running or the result sheet is open. */
    fun onQr(payload: String) {
        val ready = ready() ?: return
        if (ready.resolving || ready.sheetOpen) return
        if (payload.isBlank()) return
        resolve(ScanInput.QrCode(payload = payload.trim(), lat = null, lon = null), fromCamera = true)
    }

    fun closeSheet() = updateReady { it.copy(sheetOpen = false) }

    // ------------------------------------------------------------------ result actions

    fun toggleSaved() {
        val ready = ready() ?: return
        val pin = ready.result?.property?.pin ?: return
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

    /** "True cost card": the card at the list price, with the agent's contact card, into the share sheet. */
    fun shareTrueCost() {
        val ready = ready() ?: return
        val result = ready.result ?: return
        if (ready.sharing) return
        updateReady { it.copy(sharing = true) }
        viewModelScope.launch {
            try {
                val inputs = result.listPrice?.let { TrueCostInputs(price = it) }
                val card = repos.marketing.trueCostCard(result.property.pin, inputs, true)
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

    // ------------------------------------------------------------------ history

    fun openHistory() {
        updateReady { it.copy(historyOpen = true, historyLoading = it.history == null) }
        viewModelScope.launch {
            try {
                val items = repos.scan.history()
                updateReady { it.copy(history = items, historyLoading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateReady { it.copy(historyLoading = false, history = it.history ?: emptyList(), notice = e.friendlyMessage()) }
            }
        }
    }

    fun closeHistory() = updateReady { it.copy(historyOpen = false) }

    /** Shows an earlier scan again, in paste mode with the panel inline. */
    fun showHistoryItem(item: ScanHistoryItem) {
        resolveJob?.cancel()
        lastInput = null
        updateReady {
            it.copy(
                mode = ScanMode.Paste,
                historyOpen = false,
                sheetOpen = false,
                resolving = false,
                error = null,
                result = item.result,
                saved = false,
                url = "",
            )
        }
    }

    /** Called by the screen once the snackbar has shown the notice. */
    fun clearNotice() = updateReady { it.copy(notice = null) }

    // ------------------------------------------------------------------ lookup

    private fun resolve(input: ScanInput, fromCamera: Boolean) {
        resolveJob?.cancel()
        lastInput = input
        updateReady { it.copy(resolving = true, error = null, result = if (fromCamera) it.result else null) }
        resolveJob = viewModelScope.launch {
            try {
                val result = repos.scan.resolve(input)
                if (fromCamera) platform.haptic(Haptic.Success)
                updateReady { it.copy(resolving = false, result = result, saved = false, error = null, sheetOpen = fromCamera && it.mode == ScanMode.Camera) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (fromCamera) platform.haptic(Haptic.Warning)
                updateReady { it.copy(resolving = false, error = classify(e, input)) }
            }
        }
    }

    private fun classify(e: Exception, input: ScanInput): ScanError = when (e) {
        is NetworkException -> ScanError(ScanErrorKind.Network, e.userMessage)
        is PropertyApi.NotFoundException -> ScanError(ScanErrorKind.NotFound, e.userMessage)
        is WatchdogException -> when (input) {
            is ScanInput.ListingUrl, is ScanInput.QrCode -> ScanError(ScanErrorKind.UnsupportedLink, e.userMessage)
            is ScanInput.Address -> ScanError(ScanErrorKind.NotFound, e.userMessage)
        }
        else -> ScanError(ScanErrorKind.Other, "Something went wrong. Try again.")
    }

    /**
     * The lookup a pasted text asks for, or null while it is not a listing yet: a Zillow, Realtor.com or Redfin
     * detail page, a Watchdog property link, or a bare PIN (a sign's QR payload typed by hand).
     */
    private fun listingInput(text: String): ScanInput? {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return null
        return when (val payload = ListingLinks.parsePayload(trimmed)) {
            is ListingLinks.Payload.Listing -> ScanInput.ListingUrl(payload.listing.url)
            is ListingLinks.Payload.Pin -> ScanInput.ListingUrl(trimmed)
            else -> null
        }
    }

    /** A friendly reason when the text holds a link Watchdog cannot read; null while it is plain typing. */
    private fun unsupportedReason(text: String): String? {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || ListingLinks.findUrl(trimmed) == null) return null
        return when (val payload = ListingLinks.parsePayload(trimmed)) {
            is ListingLinks.Payload.NotAProperty -> "That link opens ${payload.reason}, not a home. Paste the listing page instead."
            else -> "That link isn’t a listing page. Paste a Zillow, Realtor.com or Redfin link to a home."
        }
    }

    /** "https://www.zillow.com/homedetails/…" reads as "zillow.com/homedetails/…" in the field. */
    private fun displayUrl(url: String): String =
        url.trim().replaceFirst(Regex("^https?://", RegexOption.IGNORE_CASE), "").replaceFirst(Regex("^www\\.", RegexOption.IGNORE_CASE), "")

    private fun ready(): ScanUiState.Ready? = _state.value as? ScanUiState.Ready

    private inline fun updateReady(transform: (ScanUiState.Ready) -> ScanUiState.Ready) {
        _state.update { s -> if (s is ScanUiState.Ready) transform(s) else s }
    }

    private fun Exception.friendlyMessage(): String =
        (this as? WatchdogException)?.userMessage ?: "Something went wrong. Try again."

    private companion object {
        const val TYPING_PAUSE_MILLIS = 400L
    }
}
