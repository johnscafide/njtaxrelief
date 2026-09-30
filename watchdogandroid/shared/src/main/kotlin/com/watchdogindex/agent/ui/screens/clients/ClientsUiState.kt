package com.watchdogindex.agent.ui.screens.clients

import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.ClientsOverview
import com.watchdogindex.agent.core.model.NextActionKind

/** How the list is ordered. [Suggested] keeps the repository's ranking, which leads with what needs the agent. */
enum class ClientSort(val label: String) {
    Suggested("Suggested: needs you first"),
    Address("Street, A to Z"),
    Town("Town, A to Z"),
    Newest("Newest relationship first"),
}

/** The sheets the Clients screen can open over the list. */
enum class ClientsSheet { ReviewCheckups, AddClients, SortFilter }

/**
 * Which way of adding clients is expanded inside the Add clients sheet. Only the pasted CSV for now: a "From
 * contacts" row returns once the platform offers a contact picker (`PlatformServices`), so the sheet never shows
 * a control that cannot act on the device in hand.
 */
enum class AddClientsMode { Csv }

/** An email the screen hands to the platform's mail composer once, then clears. */
data class EmailDraft(val subject: String, val body: String)

/** The Clients tab: the overview for the current filter and query plus every bit of screen state that survives a reload. */
sealed interface ClientsUiState {
    data object Loading : ClientsUiState

    data class Ready(
        val overview: ClientsOverview,
        /** The chip the agent chose; equals [loadedFilter] except while its rows are on their way. */
        val filter: ClientFilter = ClientFilter.All,
        /** What the agent typed; equals [loadedQuery] except while its rows are on their way. */
        val query: String = "",
        /** The filter [overview] was fetched for, so a failed chip tap can fall back to a truthful chip. */
        val loadedFilter: ClientFilter = filter,
        /** The query [overview] was fetched for. */
        val loadedQuery: String = query,
        /** The top bar shows the inline search field instead of the title. */
        val searchOpen: Boolean = false,
        val sort: ClientSort = ClientSort.Suggested,
        /** Hides homes with no status chip and nothing to do this week. */
        val onlyWithNews: Boolean = false,
        val refreshing: Boolean = false,
        val sheet: ClientsSheet? = null,
        /** Every home with a checkup ready, for the review sheet; null while it loads (or when listing them failed). */
        val readyRows: List<ClientRow>? = null,
        val sending: Boolean = false,
        /**
         * Why the review sheet could not list or send the checkups, shown inside the sheet: a snackbar in the
         * screen's Scaffold would draw under the modal sheet. Cleared when the sheet opens or closes.
         */
        val reviewError: String? = null,
        /** Rows whose "Send tax checkup" is in flight; their next-action line reads "Sending…" and takes no second tap. */
        val sendingIds: Set<String> = emptySet(),
        /** Rows being snoozed; the swipe and the accessibility action wait until the row comes back snoozed. */
        val snoozingIds: Set<String> = emptySet(),
        val addMode: AddClientsMode? = null,
        val csvText: String = "",
        val importing: Boolean = false,
        val importError: String? = null,
        val emailDraft: EmailDraft? = null,
        /** A one-line message for the snackbar; cleared by [ClientsViewModel.clearNotice]. */
        val notice: String? = null,
    ) : ClientsUiState {
        /** The repository's rows for the filter and query, in the chosen order, minus the quiet homes when asked. */
        val visibleRows: List<ClientRow>
            get() {
                val rows = if (onlyWithNews) overview.rows.filter { it.hasNews } else overview.rows
                return when (sort) {
                    ClientSort.Suggested -> rows
                    ClientSort.Address -> rows.sortedWith(compareBy({ it.streetName }, { it.houseNumber }, { it.address }))
                    ClientSort.Town -> rows.sortedWith(compareBy({ it.town }, { it.streetName }, { it.houseNumber }))
                    ClientSort.Newest -> rows.sortedWith(compareByDescending<ClientRow> { it.relationshipYear ?: Int.MIN_VALUE }.thenBy { it.address })
                }
            }

        /** "All 146", "Past clients 58", "Sphere 88", "Checkup ready 12", in [ClientFilter] order. */
        val chipLabels: List<String>
            get() = ClientFilter.entries.map { f ->
                when (f) {
                    ClientFilter.All -> "All ${Format.number(overview.all)}"
                    ClientFilter.PastClients -> "Past clients ${Format.number(overview.pastClients)}"
                    ClientFilter.Sphere -> "Sphere ${Format.number(overview.sphere)}"
                    ClientFilter.CheckupReady -> "Checkup ready ${Format.number(overview.checkupsReady)}"
                }
            }

        /** How many checkups the review sheet would send: the loaded list when it is here, the season's count until then. */
        val readyCount: Int get() = readyRows?.size ?: overview.checkupsReady
    }

    data class Error(val userMessage: String) : ClientsUiState
}

/** A home with a status chip or something to do this week. */
private val ClientRow.hasNews: Boolean get() = status != null || nextAction.kind != NextActionKind.None

private val ClientRow.streetName: String get() = address.trim().substringAfter(' ', address).lowercase()

private val ClientRow.houseNumber: Int get() = address.trim().substringBefore(' ').filter(Char::isDigit).toIntOrNull() ?: Int.MAX_VALUE
