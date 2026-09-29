package com.watchdogindex.agent.ui.screens.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.AgentTask
import com.watchdogindex.agent.core.model.PropertyChange
import com.watchdogindex.agent.core.model.WeekDigest
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The Today tab: this week's digest plus the signed-in agent's initials for the search bar avatar. */
sealed interface TodayUiState {
    data object Loading : TodayUiState

    data class Ready(
        val digest: WeekDigest,
        /** Empty when the account could not be read; the avatar then shows no initials. */
        val initials: String,
        /** "Needs you" shows the top [TOP_TASKS] until the agent asks for all of them. */
        val showAllTasks: Boolean = false,
        /** "Top changes" shows the top [TOP_CHANGES] until "See all" is tapped. */
        val showAllChanges: Boolean = false,
        val refreshing: Boolean = false,
        /** A one-line message for the snackbar (a failed tick or refresh); cleared by [TodayViewModel.clearNotice]. */
        val notice: String? = null,
    ) : TodayUiState {
        val visibleTasks: List<AgentTask>
            get() = if (showAllTasks) digest.tasks else digest.tasks.take(TOP_TASKS)
        val visibleChanges: List<PropertyChange>
            get() = if (showAllChanges) digest.changes else digest.changes.take(TOP_CHANGES)
        val hasMoreTasks: Boolean get() = digest.tasks.size > TOP_TASKS
        val hasMoreChanges: Boolean get() = digest.changes.size > TOP_CHANGES
    }

    data class Error(val userMessage: String) : TodayUiState

    companion object {
        /** The mockup lists three tasks under "Needs you" and four rows under "Top changes". */
        const val TOP_TASKS = 3
        const val TOP_CHANGES = 4
    }
}

class TodayViewModel(private val repos: Repositories) : ViewModel() {
    private val _state = MutableStateFlow<TodayUiState>(TodayUiState.Loading)
    val state: StateFlow<TodayUiState> = _state.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    /** First load, or a retry after an error: shows the skeleton while the digest arrives. */
    fun load() = reload(keepContent = false)

    /** Pull-to-refresh: keeps the current digest on screen and only flags [TodayUiState.Ready.refreshing]. */
    fun refresh() = reload(keepContent = true)

    private fun reload(keepContent: Boolean) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val previous = _state.value as? TodayUiState.Ready
            _state.value = if (keepContent && previous != null) previous.copy(refreshing = true) else TodayUiState.Loading
            try {
                val (digest, initials) = coroutineScope {
                    val digest = async { repos.digest.thisWeek() }
                    val initials = async {
                        try {
                            repos.auth.account().initials
                        } catch (e: WatchdogException) {
                            previous?.initials.orEmpty()
                        }
                    }
                    digest.await() to initials.await()
                }
                _state.value = TodayUiState.Ready(
                    digest = digest,
                    initials = initials,
                    showAllTasks = previous?.showAllTasks ?: false,
                    showAllChanges = previous?.showAllChanges ?: false,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                fail(e.userMessage, previous)
            } catch (e: Exception) {
                fail("Something went wrong loading this week. Try again.", previous)
            }
        }
    }

    private fun fail(message: String, previous: TodayUiState.Ready?) {
        _state.value = previous?.copy(refreshing = false, notice = message) ?: TodayUiState.Error(message)
    }

    /**
     * Ticks or unticks a task. The row and the "N this week" count change immediately; if the backend refuses,
     * the tick is put back and the reason goes to [TodayUiState.Ready.notice].
     */
    fun setTaskDone(taskId: String, done: Boolean) {
        val current = _state.value as? TodayUiState.Ready ?: return
        if (current.digest.tasks.none { it.id == taskId }) return
        _state.value = current.copy(digest = current.digest.withTaskDone(taskId, done))
        viewModelScope.launch {
            try {
                repos.digest.markTaskDone(taskId, done)
            } catch (e: CancellationException) {
                throw e
            } catch (e: WatchdogException) {
                revertTask(taskId, !done, e.userMessage)
            } catch (e: Exception) {
                revertTask(taskId, !done, "That task could not be saved. Try again.")
            }
        }
    }

    private fun revertTask(taskId: String, done: Boolean, message: String) {
        _state.update { s ->
            if (s is TodayUiState.Ready) s.copy(digest = s.digest.withTaskDone(taskId, done), notice = message) else s
        }
    }

    fun toggleAllTasks() {
        _state.update { s -> if (s is TodayUiState.Ready) s.copy(showAllTasks = !s.showAllTasks) else s }
    }

    fun toggleAllChanges() {
        _state.update { s -> if (s is TodayUiState.Ready) s.copy(showAllChanges = !s.showAllChanges) else s }
    }

    fun clearNotice() {
        _state.update { s -> if (s is TodayUiState.Ready && s.notice != null) s.copy(notice = null) else s }
    }
}

/** The digest with one task's tick changed and "Needs you" recounted the way the repository counts it (open tasks). */
private fun WeekDigest.withTaskDone(taskId: String, done: Boolean): WeekDigest {
    val tasks = tasks.map { if (it.id == taskId) it.copy(done = done) else it }
    return copy(tasks = tasks, needsYouCount = tasks.count { !it.done })
}
