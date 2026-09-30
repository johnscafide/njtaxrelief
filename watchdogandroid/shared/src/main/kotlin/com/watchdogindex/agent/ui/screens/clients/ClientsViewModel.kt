package com.watchdogindex.agent.ui.screens.clients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.ClientImportRow
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.ClientsOverview
import com.watchdogindex.agent.core.model.NextActionKind
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** How the list is ordered. [Suggested] keeps the repository's ranking, which leads with what needs the agent. */
enum class ClientSort(val label: String) {
    Suggested("Suggested: needs you first"),
    Address("Street, A to Z"),
    Town("Town, A to Z"),
    Newest("Newest relationship first"),
}

/** The sheets the Clients screen can open over the list. */
enum class ClientsSheet { ReviewCheckups, AddClients, SortFilter }

/** Which way of adding clients is expanded inside the Add clients sheet. */
enum class AddClientsMode { Contacts, Csv }

/** An email the screen hands to the platform's mail composer once, then clears. */
data class EmailDraft(val subject: String, val body: String)

/** The Clients tab: the overview for the current filter and query plus every bit of screen state that survives a reload. */
sealed interface ClientsUiState {
    data object Loading : ClientsUiState

    data class Ready(
        val overview: ClientsOverview,
        val filter: ClientFilter = ClientFilter.All,
        val query: String = "",
        /** The top bar shows the inline search field instead of the title. */
        val searchOpen: Boolean = false,
        val sort: ClientSort = ClientSort.Suggested,
        /** Hides homes with no status chip and nothing to do this week. */
        val onlyWithNews: Boolean = false,
        val refreshing: Boolean = false,
        val sheet: ClientsSheet? = null,
        /** Every home with a checkup ready, for the review sheet; null while it loads. */
        val readyRows: List<ClientRow>? = null,
        val sending: Boolean = false,
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

class ClientsViewModel(private val repos: Repositories) : ViewModel() {
    private val _state = MutableStateFlow<ClientsUiState>(ClientsUiState.Loading)
    val state: StateFlow<ClientsUiState> = _state.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    /** First load or a retry after an error: the skeleton shows until the overview arrives. */
    fun load() = reload(keepContent = false, refreshing = false)

    /** Pull to refresh: keeps the list on screen and only flags [ClientsUiState.Ready.refreshing]. */
    fun refresh() = reload(keepContent = true, refreshing = true)

    /**
     * Fetches the overview for the current filter and query. With [keepContent] the previous rows stay on
     * screen until the new ones arrive (chip taps and typing never flash a skeleton).
     */
    private fun reload(keepContent: Boolean, refreshing: Boolean) {
        val previous = _state.value as? ClientsUiState.Ready
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.value = when {
                keepContent && previous != null -> previous.copy(refreshing = refreshing)
                else -> ClientsUiState.Loading
            }
            val filter = previous?.filter ?: ClientFilter.All
            val query = previous?.query.orEmpty()
            try {
                val overview = repos.clients.overview(filter, query)
                _state.update { s ->
                    val base = (s as? ClientsUiState.Ready) ?: previous
                    base?.copy(overview = overview, refreshing = false) ?: ClientsUiState.Ready(overview = overview)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                fail(e.userMessage, previous)
            } catch (e: Exception) {
                fail("Your clients could not be loaded. Try again.", previous)
            }
        }
    }

    private fun fail(message: String, previous: ClientsUiState.Ready?) {
        _state.value = previous?.copy(refreshing = false, notice = message) ?: ClientsUiState.Error(message)
    }

    private inline fun updateReady(transform: (ClientsUiState.Ready) -> ClientsUiState.Ready) {
        _state.update { s -> if (s is ClientsUiState.Ready) transform(s) else s }
    }

    // ------------------------------------------------------------------ filter, search, sort

    fun setFilter(filter: ClientFilter) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.filter == filter) return
        _state.value = current.copy(filter = filter)
        reload(keepContent = true, refreshing = false)
    }

    fun setSearchOpen(open: Boolean) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.searchOpen == open) return
        val hadQuery = current.query.isNotEmpty()
        _state.value = current.copy(searchOpen = open, query = if (open) current.query else "")
        // Closing the field drops the query, so the full list comes back.
        if (!open && hadQuery) reload(keepContent = true, refreshing = false)
    }

    fun setQuery(query: String) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.query == query) return
        _state.value = current.copy(query = query)
        reload(keepContent = true, refreshing = false)
    }

    fun setSort(sort: ClientSort) = updateReady { it.copy(sort = sort) }

    fun setOnlyWithNews(on: Boolean) = updateReady { it.copy(onlyWithNews = on) }

    // ------------------------------------------------------------------ sheets

    fun openSheet(sheet: ClientsSheet) {
        updateReady { it.copy(sheet = sheet, addMode = null, importError = null) }
        if (sheet == ClientsSheet.ReviewCheckups) loadReadyRows()
    }

    fun closeSheet() = updateReady { it.copy(sheet = null, addMode = null, importError = null) }

    /** The review sheet lists every home with a checkup ready, whatever the list's filter shows. */
    private fun loadReadyRows() {
        updateReady { it.copy(readyRows = null) }
        viewModelScope.launch {
            try {
                val ready = repos.clients.overview(ClientFilter.CheckupReady).rows
                updateReady { if (it.sheet == ClientsSheet.ReviewCheckups) it.copy(readyRows = ready) else it }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(readyRows = emptyList(), notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(readyRows = emptyList(), notice = "The ready checkups could not be listed. Try again.") }
            }
        }
    }

    /** "Review and send": sends every ready checkup, reloads the list and reports the count. */
    fun sendAllReadyCheckups() {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.sending) return
        _state.value = current.copy(sending = true)
        viewModelScope.launch {
            try {
                val sent = repos.clients.sendAllReadyCheckups()
                val overview = repos.clients.overview(current.filter, current.query)
                updateReady {
                    it.copy(
                        overview = overview,
                        sending = false,
                        sheet = null,
                        readyRows = null,
                        notice = if (sent == 0) "No checkups were waiting to be sent" else "${Format.count(sent, "tax checkup")} sent",
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(sending = false, notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(sending = false, notice = "The checkups could not be sent. Try again.") }
            }
        }
    }

    // ------------------------------------------------------------------ row actions

    /**
     * "Send tax checkup" on one row: records the send, then hands the screen an email with the public checkup
     * link (the agent sends it under their own name), and reloads so the row shows "Checkup sent".
     */
    fun sendCheckup(row: ClientRow) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        viewModelScope.launch {
            try {
                repos.clients.sendCheckup(row.id)
                val link = row.pin?.let { pin ->
                    try {
                        repos.properties.checkupLink(pin)
                    } catch (e: WatchdogException) {
                        null
                    }
                }
                val overview = repos.clients.overview(current.filter, current.query)
                val deadline = current.overview.season?.appealDeadline
                val body = buildString {
                    append("Hi,\n\nYour tax checkup for ${row.address} is ready. It shows whether the assessment holds up")
                    if (deadline != null) append(" and the $deadline appeal deadline") else append(" and the next appeal deadline")
                    append(".\n\n")
                    if (link != null) append(link).append("\n\n")
                    append("Happy to walk through it whenever suits you.")
                }
                updateReady {
                    it.copy(
                        overview = overview,
                        notice = "Tax checkup sent for ${row.address}",
                        emailDraft = EmailDraft(subject = "Your tax checkup for ${row.address}", body = body),
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(notice = "That checkup could not be sent. Try again.") }
            }
        }
    }

    /** Swipe to snooze: the row's task waits until next Monday. */
    fun snooze(row: ClientRow) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        viewModelScope.launch {
            try {
                repos.clients.snooze(row.id)
                val overview = repos.clients.overview(current.filter, current.query)
                updateReady { it.copy(overview = overview, notice = "${row.address} snoozed until next Monday") }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(notice = "That home could not be snoozed. Try again.") }
            }
        }
    }

    // ------------------------------------------------------------------ add clients

    fun setAddMode(mode: AddClientsMode) = updateReady { it.copy(addMode = if (it.addMode == mode) null else mode, importError = null) }

    fun setCsvText(text: String) = updateReady { it.copy(csvText = text, importError = null) }

    /** Parses the pasted CSV and imports it; each home is matched to a parcel by the repository. */
    fun importCsv() {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.importing) return
        val parsed = parseClientCsv(current.csvText)
        if (parsed.error != null) {
            _state.value = current.copy(importError = parsed.error)
            return
        }
        _state.value = current.copy(importing = true, importError = null)
        viewModelScope.launch {
            try {
                val added = repos.clients.import(parsed.rows)
                val overview = repos.clients.overview(current.filter, current.query)
                updateReady {
                    it.copy(
                        overview = overview,
                        importing = false,
                        sheet = null,
                        addMode = null,
                        csvText = "",
                        notice = "${Format.count(added, "client")} added and matched to parcels",
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(importing = false, importError = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(importing = false, importError = "The import did not go through. Try again.") }
            }
        }
    }

    fun clearEmailDraft() = updateReady { if (it.emailDraft != null) it.copy(emailDraft = null) else it }

    fun clearNotice() = updateReady { if (it.notice != null) it.copy(notice = null) else it }
}

/** The outcome of reading a pasted CSV: the rows, or one message saying what to fix. */
internal class ParsedCsv(val rows: List<ClientImportRow>, val error: String?)

/**
 * Reads "address, town, relationship, year, crm_ref" lines. A header line is skipped, quotes are honoured
 * around commas, the relationship words are forgiving ("past client", "client", "sphere", "farm",
 * "watching"; blank means sphere) and only the address and town are required.
 */
internal fun parseClientCsv(text: String): ParsedCsv {
    val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
    if (lines.isEmpty()) return ParsedCsv(emptyList(), "Paste at least one line: address, town, relationship, year, crm_ref.")
    val rows = ArrayList<ClientImportRow>()
    lines.forEachIndexed { index, line ->
        val cells = splitCsvLine(line)
        val first = cells.getOrNull(0).orEmpty().lowercase()
        if (index == 0 && (first == "address" || first == "street")) return@forEachIndexed
        val address = cells.getOrNull(0).orEmpty()
        val town = cells.getOrNull(1).orEmpty()
        if (address.isEmpty() || town.isEmpty()) {
            return ParsedCsv(emptyList(), "Line ${index + 1} needs at least an address and a town.")
        }
        val relationship = when (cells.getOrNull(2).orEmpty().lowercase().replace('_', ' ').trim()) {
            "", "sphere", "contact" -> Relationship.Sphere
            "past client", "past", "client", "pastclient", "past-client" -> Relationship.PastClient
            "farm" -> Relationship.Farm
            "watching", "watch" -> Relationship.Watching
            else -> return ParsedCsv(emptyList(), "Line ${index + 1}: relationship must be past client, sphere, farm or watching.")
        }
        val yearText = cells.getOrNull(3).orEmpty()
        val year = if (yearText.isEmpty()) null else yearText.toIntOrNull()
            ?: return ParsedCsv(emptyList(), "Line ${index + 1}: the year should be a number such as 2019.")
        rows += ClientImportRow(
            address = address,
            town = town,
            relationship = relationship,
            year = year,
            crmRef = cells.getOrNull(4)?.takeIf { it.isNotEmpty() },
        )
    }
    if (rows.isEmpty()) return ParsedCsv(emptyList(), "Add a home under the header line.")
    return ParsedCsv(rows, null)
}

/** Splits one CSV line on commas outside double quotes and trims each cell. */
private fun splitCsvLine(line: String): List<String> {
    val cells = ArrayList<String>()
    val cell = StringBuilder()
    var quoted = false
    for (ch in line) {
        when {
            ch == '"' -> quoted = !quoted
            ch == ',' && !quoted -> {
                cells += cell.toString().trim()
                cell.setLength(0)
            }
            else -> cell.append(ch)
        }
    }
    cells += cell.toString().trim()
    return cells
}
