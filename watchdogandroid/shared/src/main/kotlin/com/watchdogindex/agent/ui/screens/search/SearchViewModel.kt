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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Address search over PropertyRepository.search: debounced while typing, run at once from the keyboard's
 * Search action or "Try again", cancelled when the query changes, with the previous results kept on screen
 * (flagged [SearchUiState.Ready.searching]) until the new ones arrive.
 */
class SearchViewModel(private val repos: Repositories, initialQuery: String) : ViewModel() {

    /** A query plus an attempt counter so "Try again" re-runs the same text. */
    private data class Request(val query: String, val attempt: Int)

    private val _query = MutableStateFlow(initialQuery)

    /**
     * The text in the search field. [setQuery] writes it synchronously, so the field never sees a value one
     * frame behind what was typed; it also survives configuration changes.
     */
    val query: StateFlow<String> = _query.asStateFlow()

    /** Bumped by [searchNow]; a change here runs the search without the typing debounce. */
    private val attempt = MutableStateFlow(0)

    private val _state = MutableStateFlow<SearchUiState>(SearchUiState.Ready(query = "", results = emptyList()))
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            var lastAttempt = attempt.value
            combine(_query, attempt) { text, n -> Request(text, n) }.collectLatest { request ->
                // A new attempt number means "search now"; the same number means the text changed while typing.
                val immediate = request.attempt != lastAttempt
                lastAttempt = request.attempt
                val q = request.query.trim()
                if (q.isEmpty()) {
                    _state.value = SearchUiState.Ready(query = "", results = emptyList())
                    return@collectLatest
                }
                _state.update { current ->
                    if (current is SearchUiState.Ready && current.results.isNotEmpty()) current.copy(searching = true) else SearchUiState.Loading
                }
                if (!immediate) delay(DEBOUNCE_MILLIS)
                try {
                    val results = repos.properties.search(q)
                    _state.value = SearchUiState.Ready(
                        query = q,
                        results = results.take(MAX_RESULTS),
                        truncated = results.size > MAX_RESULTS,
                    )
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    _state.value = SearchUiState.Error(e.friendlyMessage())
                }
            }
        }
    }

    fun setQuery(text: String) {
        _query.value = text
    }

    fun clearQuery() = setQuery("")

    /** Runs the current query again right away (the keyboard's Search action, or "Try again"). */
    fun searchNow() = attempt.update { it + 1 }

    private fun Exception.friendlyMessage(): String =
        (this as? WatchdogException)?.userMessage ?: "Something went wrong. Try again."

    companion object {
        const val DEBOUNCE_MILLIS = 250L

        /**
         * The most homes one search shows. The repositories already stop at 25 (sample) and 12 (the live
         * agent-property-search API), so this is a guard that keeps the eagerly composed result list bounded
         * if a repository ever grows a larger page.
         */
        const val MAX_RESULTS = 25
    }
}
