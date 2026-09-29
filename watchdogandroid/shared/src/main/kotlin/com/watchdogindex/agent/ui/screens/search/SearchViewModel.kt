package com.watchdogindex.agent.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.SharingStarted

/**
 * Address search over PropertyRepository.search: debounced while typing, cancelled when the query changes,
 * with the previous results kept on screen until the new ones arrive.
 */
class SearchViewModel(private val repos: Repositories, initialQuery: String) : ViewModel() {

    /** A query plus an attempt counter so "Try again" re-runs the same text. */
    private data class Request(val query: String, val attempt: Int = 0)

    private val requests = MutableStateFlow(Request(initialQuery))

    /** The text in the search field, kept here so it survives configuration changes. */
    val query: StateFlow<String> = requests.map { it.query }.stateIn(viewModelScope, SharingStarted.Eagerly, initialQuery)

    private val _state = MutableStateFlow<SearchUiState>(SearchUiState.Ready(query = "", results = emptyList()))
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            requests.collectLatest { request ->
                val q = request.query.trim()
                if (q.isEmpty()) {
                    _state.value = SearchUiState.Ready(query = "", results = emptyList())
                    return@collectLatest
                }
                _state.update { current ->
                    if (current is SearchUiState.Ready && current.results.isNotEmpty()) current.copy(searching = true) else SearchUiState.Loading
                }
                if (request.attempt == 0) delay(DEBOUNCE_MILLIS)
                try {
                    val results = repos.properties.search(q)
                    _state.value = SearchUiState.Ready(query = q, results = results)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    _state.value = SearchUiState.Error(e.friendlyMessage())
                }
            }
        }
    }

    fun setQuery(text: String) = requests.update { Request(text) }

    fun clearQuery() = setQuery("")

    /** Runs the current query again right away (the keyboard's Search action, or "Try again"). */
    fun searchNow() = requests.update { it.copy(attempt = it.attempt + 1) }

    private fun Exception.friendlyMessage(): String =
        (this as? WatchdogException)?.userMessage ?: "Something went wrong. Try again."

    companion object {
        const val DEBOUNCE_MILLIS = 250L
    }
}
