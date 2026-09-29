package com.watchdogindex.agent.ui.screens.welcome

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.repo.Repositories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Drives the Welcome screen's sign-in: the email code flow the website's Agent Desk uses
 * (send a six-digit code, verify it) and passkeys where the platform offers them. Data only through
 * [Repositories]; every failure becomes a friendly inline message.
 */
class WelcomeViewModel(private val repos: Repositories) : ViewModel() {

    private val _state = MutableStateFlow<WelcomeUiState>(WelcomeUiState.Loading)
    val state: StateFlow<WelcomeUiState> = _state.asStateFlow()

    private var cooldown: Job? = null

    init {
        // Nothing to fetch: the host restores a stored session before it ever shows Welcome.
        _state.value = WelcomeUiState.Ready()
    }

    /** "Continue with email": reveal the email field. */
    fun startEmail() = updateReady { it.copy(step = SignInStep.Email, inlineError = null) }

    /** Back to the two entry buttons; any pending resend cooldown is dropped. */
    fun backToStart() {
        cooldown?.cancel()
        updateReady { it.copy(step = SignInStep.Start, code = "", resendSeconds = 0, inlineError = null, busy = false) }
    }

    /** From the code step back to the email field, keeping what was typed. */
    fun editEmail() {
        cooldown?.cancel()
        updateReady { it.copy(step = SignInStep.Email, code = "", resendSeconds = 0, inlineError = null) }
    }

    fun setEmail(value: String) = updateReady { it.copy(email = value, inlineError = null) }

    /** Keeps digits only, at most six. */
    fun setCode(value: String) = updateReady { it.copy(code = value.filter(Char::isDigit).take(CODE_LENGTH), inlineError = null) }

    /** Sends (or re-sends) the code to the typed email and moves to the code step. */
    fun sendCode() {
        val ready = _state.value as? WelcomeUiState.Ready ?: return
        if (ready.busy || ready.email.isBlank()) return
        if (ready.step == SignInStep.Code && ready.resendSeconds > 0) return
        updateReady { it.copy(busy = true, inlineError = null) }
        viewModelScope.launch {
            try {
                repos.auth.sendCode(ready.email.trim())
                updateReady { it.copy(busy = false, step = SignInStep.Code, code = "") }
                startCooldown()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateReady { it.copy(busy = false, inlineError = e.friendlyMessage()) }
            }
        }
    }

    /** Verifies the six digits; on success marks the account as welcomed and flags [WelcomeUiState.Ready.signedIn]. */
    fun verifyCode() {
        val ready = _state.value as? WelcomeUiState.Ready ?: return
        if (ready.busy || ready.code.length != CODE_LENGTH) return
        updateReady { it.copy(busy = true, inlineError = null) }
        viewModelScope.launch {
            try {
                repos.auth.verifyCode(ready.email.trim(), ready.code)
                finishSignIn()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateReady { it.copy(busy = false, inlineError = e.friendlyMessage()) }
            }
        }
    }

    /** Passkey sign-in through the platform's credential manager (only offered when the platform supports it). */
    fun signInWithPasskey() {
        val ready = _state.value as? WelcomeUiState.Ready ?: return
        if (ready.busy) return
        updateReady { it.copy(busy = true, inlineError = null) }
        viewModelScope.launch {
            try {
                repos.auth.signInWithPasskey()
                finishSignIn()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                updateReady { it.copy(busy = false, inlineError = e.friendlyMessage()) }
            }
        }
    }

    /** From the [WelcomeUiState.Error] state back to a fresh Ready state. */
    fun reset() {
        cooldown?.cancel()
        _state.value = WelcomeUiState.Ready()
    }

    private suspend fun finishSignIn() {
        cooldown?.cancel()
        try {
            repos.settings.update { it.copy(hasSeenWelcome = true) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // A preference that failed to persist must not block a successful sign-in.
        }
        updateReady { it.copy(busy = false, resendSeconds = 0, signedIn = true) }
    }

    private fun startCooldown() {
        cooldown?.cancel()
        cooldown = viewModelScope.launch {
            for (seconds in RESEND_COOLDOWN_SECONDS downTo 1) {
                updateReady { it.copy(resendSeconds = seconds) }
                delay(1_000L)
            }
            updateReady { it.copy(resendSeconds = 0) }
        }
    }

    private inline fun updateReady(transform: (WelcomeUiState.Ready) -> WelcomeUiState.Ready) {
        _state.update { current -> if (current is WelcomeUiState.Ready) transform(current) else current }
    }

    private fun Exception.friendlyMessage(): String =
        (this as? WatchdogException)?.userMessage ?: "Something went wrong. Try again."

    companion object {
        const val CODE_LENGTH = 6
        const val RESEND_COOLDOWN_SECONDS = 60
    }
}
