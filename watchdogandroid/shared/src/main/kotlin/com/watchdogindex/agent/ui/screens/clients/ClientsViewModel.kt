package com.watchdogindex.agent.ui.screens.clients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.ClientImportRow
import com.watchdogindex.agent.core.model.ClientRow
import com.watchdogindex.agent.core.model.Relationship
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** How long typing pauses before the query is sent: one overview request per pause, not per keystroke. */
private const val QUERY_DEBOUNCE_MS = 250L

/** [initialFilter] is the chip the route asked for; the first load fetches that filter instead of All. */
class ClientsViewModel(private val repos: Repositories, initialFilter: ClientFilter? = null) : ViewModel() {
    private val _state = MutableStateFlow<ClientsUiState>(ClientsUiState.Loading)
    val state: StateFlow<ClientsUiState> = _state.asStateFlow()

    private var loadJob: Job? = null

    /** The filter the route last asked for: the first load opens on it, and only a different request changes the chip again. */
    private var requestedFilter: ClientFilter? = initialFilter

    /** The reload waiting for the agent to pause typing; the next keystroke or any other reload cancels it. */
    private var queryJob: Job? = null

    init {
        load()
    }

    /** First load or a retry after an error: the skeleton shows until the overview arrives. */
    fun load() {
        reload(keepContent = false, refreshing = false)
    }

    /** Pull to refresh: keeps the list on screen and only flags [ClientsUiState.Ready.refreshing]. */
    fun refresh() {
        reload(keepContent = true, refreshing = true)
    }

    /**
     * Fetches the overview for the current filter and query. With [keepContent] the previous rows stay on
     * screen until the new ones arrive (chip taps and typing never flash a skeleton). Only the latest reload
     * lands: each one cancels the last, so fast chip taps or typing never flicker through stale result sets.
     * Returns the reload's job, for a row action that keeps its in-flight state until the fresh rows are here.
     */
    private fun reload(keepContent: Boolean, refreshing: Boolean): Job {
        val previous = _state.value as? ClientsUiState.Ready
        queryJob?.cancel()
        loadJob?.cancel()
        val filter = previous?.filter ?: requestedFilter ?: ClientFilter.All
        val query = previous?.query.orEmpty()
        val job = viewModelScope.launch {
            _state.value = when {
                keepContent && previous != null -> previous.copy(refreshing = refreshing)
                else -> ClientsUiState.Loading
            }
            try {
                val overview = repos.clients.overview(filter, query)
                _state.update { s ->
                    // Build on the state as it is now, not as it was: a sheet opened meanwhile stays open.
                    val base = (s as? ClientsUiState.Ready) ?: previous
                    base?.copy(overview = overview, refreshing = false, loadedFilter = filter, loadedQuery = query)
                        ?: ClientsUiState.Ready(overview = overview, filter = filter, query = query)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                fail(e.userMessage)
            } catch (e: Exception) {
                fail("Your clients could not be loaded. Try again.")
            }
        }
        loadJob = job
        return job
    }

    /**
     * A reload that did not land. With rows on screen they stay, and the chip and query go back to the ones
     * those rows were fetched for, so the list never claims to show "Sphere" over the "All" rows; the notice
     * says what happened. A query that comes back non-empty reopens the search field it belongs to.
     */
    private fun fail(message: String) {
        _state.update { s ->
            when (s) {
                is ClientsUiState.Ready -> s.copy(
                    refreshing = false,
                    notice = message,
                    filter = s.loadedFilter,
                    query = s.loadedQuery,
                    searchOpen = s.searchOpen || s.loadedQuery.isNotEmpty(),
                )
                else -> ClientsUiState.Error(message)
            }
        }
    }

    private inline fun updateReady(transform: (ClientsUiState.Ready) -> ClientsUiState.Ready) {
        _state.update { s -> if (s is ClientsUiState.Ready) transform(s) else s }
    }

    // ------------------------------------------------------------------ filter, search, sort

    /**
     * A filter the route asks for (`Route.Clients(filter)`: Today's "Review" task, the Alerts "Send checkups" action,
     * a `clients?filter=` link). Applied once per request: the same request again, which is what the screen sends
     * when it re-enters composition on a tab switch or a rotation, changes nothing, so the agent's own chip choice
     * survives. Null asks for nothing.
     */
    fun requestFilter(filter: ClientFilter?) {
        if (filter == null || filter == requestedFilter) return
        requestedFilter = filter
        if (_state.value is ClientsUiState.Ready) setFilter(filter) else reload(keepContent = false, refreshing = false)
    }

    fun setFilter(filter: ClientFilter) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.filter == filter) return
        _state.value = current.copy(filter = filter)
        reload(keepContent = true, refreshing = false)
    }

    fun setSearchOpen(open: Boolean) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.searchOpen == open) return
        val hadQuery = current.query.isNotEmpty() || current.loadedQuery.isNotEmpty()
        _state.value = current.copy(searchOpen = open, query = if (open) current.query else "")
        // Closing the field drops the query, so the full list comes back.
        if (!open && hadQuery) reload(keepContent = true, refreshing = false)
    }

    /** The field updates at once; the overview request waits for a pause in typing. Clearing the field does not wait. */
    fun setQuery(query: String) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.query == query) return
        _state.value = current.copy(query = query)
        queryJob?.cancel()
        if (query.isEmpty()) {
            reload(keepContent = true, refreshing = false)
            return
        }
        queryJob = viewModelScope.launch {
            delay(QUERY_DEBOUNCE_MS)
            queryJob = null
            reload(keepContent = true, refreshing = false)
        }
    }

    fun setSort(sort: ClientSort) = updateReady { it.copy(sort = sort) }

    fun setOnlyWithNews(on: Boolean) = updateReady { it.copy(onlyWithNews = on) }

    // ------------------------------------------------------------------ sheets

    /** Opens a sheet. The Add clients sheet opens on the pasted CSV, its one way in; the review sheet lists the ready checkups. */
    fun openSheet(sheet: ClientsSheet) {
        updateReady {
            it.copy(sheet = sheet, addMode = if (sheet == ClientsSheet.AddClients) AddClientsMode.Csv else null, importError = null, reviewError = null)
        }
        if (sheet == ClientsSheet.ReviewCheckups) loadReadyRows()
    }

    fun closeSheet() = updateReady { it.copy(sheet = null, addMode = null, importError = null, reviewError = null) }

    /** The review sheet's "Try again" after the ready checkups could not be listed. */
    fun retryReadyRows() = loadReadyRows()

    /**
     * The review sheet lists every home with a checkup ready, whatever the list's filter shows. A list that does
     * not come back is said in the sheet ([ClientsUiState.Ready.reviewError]) rather than shown as "no checkups".
     */
    private fun loadReadyRows() {
        updateReady { it.copy(readyRows = null, reviewError = null) }
        viewModelScope.launch {
            try {
                val ready = repos.clients.overview(ClientFilter.CheckupReady).rows
                updateReady { if (it.sheet == ClientsSheet.ReviewCheckups) it.copy(readyRows = ready) else it }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(reviewError = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(reviewError = "The ready checkups could not be listed. Try again.") }
            }
        }
    }

    /**
     * "Review and send": sends every ready checkup, reports the count and reloads the list. A send that fails
     * keeps the sheet open and explains itself inside it, where a snackbar under the sheet would go unseen.
     */
    fun sendAllReadyCheckups() {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (current.sending) return
        _state.value = current.copy(sending = true, reviewError = null)
        viewModelScope.launch {
            try {
                val sent = repos.clients.sendAllReadyCheckups()
                updateReady {
                    it.copy(
                        sending = false,
                        sheet = null,
                        readyRows = null,
                        notice = if (sent == 0) "No checkups were waiting to be sent" else "${Format.count(sent, "tax checkup")} sent",
                    )
                }
                reload(keepContent = true, refreshing = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(sending = false, reviewError = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(sending = false, reviewError = "The checkups could not be sent. Try again.") }
            }
        }
    }

    // ------------------------------------------------------------------ row actions

    /**
     * "Send tax checkup" on one row: records the send, then hands the screen an email with the public checkup
     * link (the agent sends it under their own name), and reloads so the row shows "Checkup sent".
     *
     * Only the send itself can fail the action. Once it is recorded, a link lookup that does not come back
     * still leaves an email to send (without the link), and the list reload reports its own problems.
     *
     * One send per row at a time: the row is in [ClientsUiState.Ready.sendingIds] (its line reads "Sending…")
     * from the tap until the reloaded rows show it as sent, so a second tap cannot record a second send or hand
     * the screen a second email draft.
     */
    fun sendCheckup(row: ClientRow) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (row.id in current.sendingIds) return
        _state.value = current.copy(sendingIds = current.sendingIds + row.id)
        viewModelScope.launch {
            try {
                try {
                    repos.clients.sendCheckup(row.id)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: WatchdogException) {
                    updateReady { it.copy(notice = e.userMessage) }
                    return@launch
                } catch (e: Exception) {
                    updateReady { it.copy(notice = "That checkup could not be sent. Try again.") }
                    return@launch
                }
                val link = row.pin?.let { pin ->
                    try {
                        repos.properties.checkupLink(pin)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        null
                    }
                }
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
                        notice = "Tax checkup sent for ${row.address}",
                        emailDraft = EmailDraft(subject = "Your tax checkup for ${row.address}", body = body),
                    )
                }
                reload(keepContent = true, refreshing = false).join()
            } finally {
                updateReady { it.copy(sendingIds = it.sendingIds - row.id) }
            }
        }
    }

    /**
     * Swipe (or the row's accessibility action) to snooze: the row's task waits until next Monday. One snooze per
     * row at a time, held in [ClientsUiState.Ready.snoozingIds] until the reloaded rows show it snoozed.
     */
    fun snooze(row: ClientRow) {
        val current = _state.value as? ClientsUiState.Ready ?: return
        if (row.id in current.snoozingIds) return
        _state.value = current.copy(snoozingIds = current.snoozingIds + row.id)
        viewModelScope.launch {
            try {
                repos.clients.snooze(row.id)
                updateReady { it.copy(notice = "${row.address} snoozed until next Monday") }
                reload(keepContent = true, refreshing = false).join()
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                updateReady { it.copy(notice = e.userMessage) }
            } catch (e: Exception) {
                updateReady { it.copy(notice = "That home could not be snoozed. Try again.") }
            } finally {
                updateReady { it.copy(snoozingIds = it.snoozingIds - row.id) }
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
                updateReady {
                    it.copy(
                        importing = false,
                        sheet = null,
                        addMode = null,
                        csvText = "",
                        notice = "${Format.count(added, "client")} added and matched to parcels",
                    )
                }
                reload(keepContent = true, refreshing = false)
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
