package com.watchdogindex.agent.ui.screens.marketing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.MarketingTab
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The Marketing tab. [initialSheetPin] opens the true cost share sheet for that home as soon as the tab has
 * loaded (the screenshot harness uses it to reproduce the approved mockup, which shows the sheet open).
 */
class MarketingViewModel(
    private val repos: Repositories,
    initialSheetPin: PamsPin? = null,
) : ViewModel() {
    private val _state = MutableStateFlow<MarketingUiState>(MarketingUiState.Loading)
    val state: StateFlow<MarketingUiState> = _state.asStateFlow()

    private var pendingSheetPin: PamsPin? = initialSheetPin
    private var loadJob: Job? = null
    private var searchJob: Job? = null
    private var cardJob: Job? = null

    init {
        load()
    }

    /** First load, or a retry after an error: the skeleton shows until the campaigns arrive. */
    fun load() = reload(keepContent = false)

    /** Refresh from the overflow menu: keeps the tab on screen and only flags [MarketingUiState.Ready.refreshing]. */
    fun refresh() = reload(keepContent = true)

    private fun reload(keepContent: Boolean) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val previous = _state.value as? MarketingUiState.Ready
            _state.value = if (keepContent && previous != null) previous.copy(refreshing = true, menuOpen = false) else MarketingUiState.Loading
            try {
                val (campaigns, account) = coroutineScope {
                    val campaigns = async { repos.marketing.campaigns() }
                    val account = async {
                        try {
                            repos.auth.account()
                        } catch (e: WatchdogException) {
                            previous?.account
                        }
                    }
                    campaigns.await() to account.await()
                }
                _state.value = previous?.copy(campaigns = campaigns, account = account, refreshing = false)
                    ?: MarketingUiState.Ready(campaigns = campaigns, account = account)
                pendingSheetPin?.let { pin ->
                    pendingSheetPin = null
                    openTrueCost(pin)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                fail(e.userMessage, previous)
            } catch (e: Exception) {
                fail("Your marketing could not be loaded. Try again.", previous)
            }
        }
    }

    private fun fail(message: String, previous: MarketingUiState.Ready?) {
        _state.value = previous?.copy(refreshing = false, notice = message) ?: MarketingUiState.Error(message)
    }

    private inline fun update(transform: (MarketingUiState.Ready) -> MarketingUiState.Ready) {
        _state.update { s -> if (s is MarketingUiState.Ready) transform(s) else s }
    }

    fun selectTab(tab: MarketingTab) = update { it.copy(tab = tab, menuOpen = false) }

    fun setMenuOpen(open: Boolean) = update { it.copy(menuOpen = open) }

    /** The top bar's search and the "New card" FAB: go to Cards and put the cursor in the address field. */
    fun focusCardSearch() = update { it.copy(tab = MarketingTab.Cards, focusCardSearch = true, menuOpen = false) }

    fun consumeFocusRequest() = update { if (it.focusCardSearch) it.copy(focusCardSearch = false) else it }

    /** Types in the Cards tab's address field; the property search runs after a short pause. */
    fun setCardQuery(query: String) {
        update { it.copy(cardQuery = query) }
        searchJob?.cancel()
        if (query.isBlank()) {
            update { it.copy(cardResults = emptyList(), searching = false) }
            return
        }
        searchJob = viewModelScope.launch {
            update { it.copy(searching = true) }
            delay(SEARCH_DEBOUNCE_MILLIS)
            try {
                val results = repos.properties.search(query.trim())
                update { s -> if (s.cardQuery == query) s.copy(cardResults = results, searching = false) else s }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                update { it.copy(searching = false, notice = e.userMessage) }
            } catch (e: Exception) {
                update { it.copy(searching = false, notice = "The address search didn’t work. Try again.") }
            }
        }
    }

    /** Opens the share sheet for a home and asks the repository for its true cost card. */
    fun openTrueCost(pin: PamsPin) {
        val current = _state.value as? MarketingUiState.Ready ?: return
        val include = current.sheet?.includeContactCard ?: true
        val known = current.recentCards.firstOrNull { it.pin == pin && (it.agent != null) == include }
        _state.value = current.copy(
            sheet = TrueCostSheetState(pin = pin, card = known, includeContactCard = include, building = known == null),
            menuOpen = false,
        )
        if (known == null) buildCard(pin, include)
    }

    /** The "Include my contact card" switch: the card is recomputed with or without the agent footer. */
    fun setIncludeContactCard(include: Boolean) {
        val sheet = (_state.value as? MarketingUiState.Ready)?.sheet ?: return
        if (sheet.includeContactCard == include) return
        update { it.copy(sheet = sheet.copy(includeContactCard = include, building = true, error = null)) }
        buildCard(sheet.pin, include)
    }

    fun retryCard() {
        val sheet = (_state.value as? MarketingUiState.Ready)?.sheet ?: return
        update { it.copy(sheet = sheet.copy(building = true, error = null)) }
        buildCard(sheet.pin, sheet.includeContactCard)
    }

    private fun buildCard(pin: PamsPin, include: Boolean) {
        cardJob?.cancel()
        cardJob = viewModelScope.launch {
            try {
                val card = repos.marketing.trueCostCard(pin, null, include)
                update { s ->
                    val sheet = s.sheet
                    if (sheet == null || sheet.pin != pin || sheet.includeContactCard != include) {
                        s
                    } else {
                        s.copy(
                            sheet = sheet.copy(card = card, building = false, error = null),
                            recentCards = listOf(card) + s.recentCards.filter { it.pin != pin },
                        )
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                failCard(pin, e.userMessage)
            } catch (e: Exception) {
                failCard(pin, "The true cost card could not be built. Try again.")
            }
        }
    }

    private fun failCard(pin: PamsPin, message: String) = update { s ->
        val sheet = s.sheet
        if (sheet == null || sheet.pin != pin) s else s.copy(sheet = sheet.copy(building = false, error = message))
    }

    fun closeSheet() {
        cardJob?.cancel()
        update { it.copy(sheet = null) }
    }

    fun setQrOpen(open: Boolean) = update { s -> s.sheet?.let { s.copy(sheet = it.copy(qrOpen = open)) } ?: s }

    /** A one-line confirmation such as "Link copied" for the snackbar. */
    fun notify(message: String) = update { it.copy(notice = message) }

    fun clearNotice() = update { if (it.notice != null) it.copy(notice = null) else it }

    private companion object {
        const val SEARCH_DEBOUNCE_MILLIS = 250L
    }
}
