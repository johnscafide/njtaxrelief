package com.watchdogindex.agent.ui.screens.search

import com.watchdogindex.agent.core.model.PropertySummary

sealed interface SearchUiState {
    /** A search is running and there is nothing older to show for the current query. */
    data object Loading : SearchUiState

    data class Ready(
        /** The query these results answer (blank = nothing searched yet). */
        val query: String,
        /** At most [SearchViewModel.MAX_RESULTS] homes, in the repository's order. */
        val results: List<PropertySummary>,
        /** A newer search is in flight; the old results stay visible meanwhile. */
        val searching: Boolean = false,
        /** The repository returned more homes than the screen shows; the list ends with a narrowing hint. */
        val truncated: Boolean = false,
    ) : SearchUiState

    data class Error(val userMessage: String) : SearchUiState
}
