package com.watchdogindex.agent.ui.screens.intelligence

import com.watchdogindex.agent.core.model.Brief
import com.watchdogindex.agent.core.model.ChatTurn
import com.watchdogindex.agent.core.model.FollowUp

/** The Watchdog Intelligence screen: the Monday brief, the follow-up prompts and this session's conversation. */
sealed interface IntelligenceUiState {
    data object Loading : IntelligenceUiState

    data class Ready(
        val brief: Brief,
        /** The conversation so far: the agent's questions and the analyst's answers with their sources. */
        val turns: List<ChatTurn> = emptyList(),
        /** Questions sent and still waiting for an answer, in the order they were asked. */
        val pending: List<String> = emptyList(),
        /**
         * Questions Watchdog Intelligence could not answer, keyed by the index of the question's turn in [turns],
         * with the friendly reason. Each keeps its own retry, so one failure never hides another.
         */
        val failed: Map<Int, String> = emptyMap(),
        /** Follow-ups the last answer suggested; the brief's own follow-ups until then. */
        val suggestedFollowUps: List<FollowUp>? = null,
        /** Text typed in the composer. */
        val draft: String = "",
        /** Watchdog Intelligence Voice is listening. */
        val listening: Boolean = false,
        val historyOpen: Boolean = false,
        /** A one-line message for the snackbar; cleared by [IntelligenceViewModel.clearNotice]. */
        val notice: String? = null,
    ) : IntelligenceUiState {
        val followUps: List<FollowUp>
            get() = suggestedFollowUps?.takeIf { it.isNotEmpty() } ?: brief.followUps

        /** The agent's questions this session, oldest first. */
        val questions: List<String>
            get() = turns.filter { it.fromAgent }.map { it.text }

        val hasConversation: Boolean
            get() = turns.isNotEmpty() || pending.isNotEmpty() || failed.isNotEmpty()
    }

    data class Error(val userMessage: String) : IntelligenceUiState
}
