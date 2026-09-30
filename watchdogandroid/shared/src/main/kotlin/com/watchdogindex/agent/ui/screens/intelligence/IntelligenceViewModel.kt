package com.watchdogindex.agent.ui.screens.intelligence

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.ChatTurn
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Watchdog Intelligence: the Monday brief and this session's conversation.
 *
 * The brief's audio is not produced by the app yet. `LiveIntelligenceRepository` sends no `listenLabel`, so the
 * Listen pill only appears with the sample brief, which has a label but no `audioUrl`; [listen] therefore opens
 * a brief's audio through the platform when a URL arrives and otherwise says listening is coming, and it never
 * pretends to play (no "Pause" state).
 */
class IntelligenceViewModel(private val repos: Repositories) : ViewModel() {
    private val _state = MutableStateFlow<IntelligenceUiState>(IntelligenceUiState.Loading)
    val state: StateFlow<IntelligenceUiState> = _state.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    /** First load, or a retry after an error: the skeleton shows until the brief arrives. */
    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val previous = _state.value as? IntelligenceUiState.Ready
            _state.value = IntelligenceUiState.Loading
            try {
                val brief = repos.intelligence.brief()
                _state.value = previous?.copy(brief = brief) ?: IntelligenceUiState.Ready(brief = brief)
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                _state.value = IntelligenceUiState.Error(e.userMessage)
            } catch (e: Exception) {
                _state.value = IntelligenceUiState.Error("Your brief could not be loaded. Try again.")
            }
        }
    }

    private inline fun update(transform: (IntelligenceUiState.Ready) -> IntelligenceUiState.Ready) {
        _state.update { s -> if (s is IntelligenceUiState.Ready) transform(s) else s }
    }

    /**
     * The Listen pill: plays the brief through [open] (the platform's URL handler) when the brief carries an
     * audio URL; otherwise tells the agent that listening is coming to the app. See the class note.
     */
    fun listen(open: (String) -> Unit) {
        val brief = (_state.value as? IntelligenceUiState.Ready)?.brief ?: return
        val url = brief.audioUrl
        if (url != null) open(url) else notify(LISTEN_COMING_MESSAGE)
    }

    fun setDraft(text: String) = update { it.copy(draft = text) }

    /** The composer's Send (button or IME action): asks the typed question and clears the field. */
    fun sendDraft() {
        val question = (_state.value as? IntelligenceUiState.Ready)?.draft?.trim().orEmpty()
        if (question.isEmpty()) return
        ask(question)
    }

    /**
     * Asks Watchdog Intelligence. The question appears in the conversation at once; the answer, with its
     * sources, is appended when it arrives, and a failure becomes a friendly bubble under that question with its
     * own retry. Other questions' failures are left alone: several can be in flight or failed at once.
     */
    fun ask(question: String) {
        val q = question.trim()
        if (q.isEmpty()) return
        val current = _state.value as? IntelligenceUiState.Ready ?: return
        val index = current.turns.size
        _state.value = current.copy(turns = current.turns + ChatTurn(fromAgent = true, text = q), draft = "")
        request(index, q)
    }

    /** Asks the failed question at [index] again in place: its bubble stays, its failure clears, no duplicate. */
    fun retry(index: Int) {
        val current = _state.value as? IntelligenceUiState.Ready ?: return
        if (index !in current.failed) return
        val question = current.turns.getOrNull(index)?.takeIf { it.fromAgent }?.text ?: return
        request(index, question)
    }

    /** Sends the question whose turn sits at [index]; the state tracks it as pending until it answers or fails. */
    private fun request(index: Int, question: String) {
        update { it.copy(pending = it.pending + question, failed = it.failed - index) }
        viewModelScope.launch {
            try {
                val answer = repos.intelligence.ask(question)
                update {
                    it.copy(
                        turns = it.turns + ChatTurn(fromAgent = false, text = answer.text, sources = answer.sources),
                        pending = it.pending - question,
                        suggestedFollowUps = answer.suggestedFollowUps,
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                failAsk(index, question, e.userMessage)
            } catch (e: Exception) {
                failAsk(index, question, "That question couldn’t be answered just now. Try again.")
            }
        }
    }

    private fun failAsk(index: Int, question: String, message: String) = update {
        it.copy(pending = it.pending - question, failed = it.failed + (index to message))
    }

    fun setListening(listening: Boolean) = update { if (it.listening == listening) it else it.copy(listening = listening) }

    fun setHistoryOpen(open: Boolean) = update { it.copy(historyOpen = open) }

    /** A one-line message for the snackbar, such as why voice is not available here. */
    fun notify(message: String) = update { it.copy(notice = message) }

    fun clearNotice() = update { if (it.notice != null) it.copy(notice = null) else it }

    private companion object {
        const val LISTEN_COMING_MESSAGE = "Listening is coming to the app"
    }
}
