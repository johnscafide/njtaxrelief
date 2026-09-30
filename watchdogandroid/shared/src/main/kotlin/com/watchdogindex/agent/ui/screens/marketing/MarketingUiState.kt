package com.watchdogindex.agent.ui.screens.marketing

import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.Campaign
import com.watchdogindex.agent.core.model.MarketingTab
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.TrueCostCard

/**
 * The true cost share sheet over the Marketing tab: the home it is for, the card once the repository has
 * built it, and the "Include my contact card" switch, which rebuilds the card without the agent footer.
 */
data class TrueCostSheetState(
    val pin: PamsPin,
    val card: TrueCostCard? = null,
    val includeContactCard: Boolean = true,
    /** True while the repository computes the card (also after the contact card switch flips). */
    val building: Boolean = true,
    /** A friendly reason the card could not be built; the sheet offers a retry. */
    val error: String? = null,
    /** The small QR dialog over the sheet. */
    val qrOpen: Boolean = false,
)

/** The Marketing tab: campaigns, the true cost cards built this session and the agent's public page. */
sealed interface MarketingUiState {
    data object Loading : MarketingUiState

    data class Ready(
        val campaigns: List<Campaign>,
        /** Null when the account could not be read; "My page" then explains instead of showing a link. */
        val account: Account?,
        val tab: MarketingTab = MarketingTab.Campaigns,
        /** The most recently built true cost cards, newest first, for the Cards tab. */
        val recentCards: List<TrueCostCard> = emptyList(),
        /** The Cards tab's address search. */
        val cardQuery: String = "",
        val cardResults: List<PropertySummary> = emptyList(),
        val searching: Boolean = false,
        val sheet: TrueCostSheetState? = null,
        /** The overflow menu under the top bar's more button. */
        val menuOpen: Boolean = false,
        val refreshing: Boolean = false,
        /** Set when the Cards tab should focus its address field on arrival; consumed by the screen. */
        val focusCardSearch: Boolean = false,
        /** A one-line message for the snackbar; cleared by [MarketingViewModel.clearNotice]. */
        val notice: String? = null,
    ) : MarketingUiState

    data class Error(val userMessage: String) : MarketingUiState
}
