package com.watchdogindex.agent.ui.screens.welcome

/** Which part of the email sign-in the Welcome screen is showing in its CTA block. */
enum class SignInStep {
    /** The two entry buttons: "Continue with email" and, where the platform supports it, "Use a passkey". */
    Start,
    /** The email field and "Send code". */
    Email,
    /** The six-digit code field, "Sign in" and the resend cooldown. */
    Code,
}

sealed interface WelcomeUiState {
    /** Before the view model has decided what to show; never visible for long, Welcome loads nothing remote. */
    data object Loading : WelcomeUiState

    data class Ready(
        val step: SignInStep = SignInStep.Start,
        val email: String = "",
        val code: String = "",
        /** A repository call is in flight; buttons show progress wording and stay disabled. */
        val busy: Boolean = false,
        /** Seconds left before "Resend code" is offered again (0 = available). */
        val resendSeconds: Int = 0,
        /** A friendly error shown inline under the field, from [com.watchdogindex.agent.core.WatchdogException.userMessage]. */
        val inlineError: String? = null,
        /** True once sign-in succeeded; the screen then opens Today and the host replaces the stack. */
        val signedIn: Boolean = false,
    ) : WelcomeUiState

    /** Something the screen cannot recover from inline; the CTA block offers "Try again". */
    data class Error(val userMessage: String) : WelcomeUiState
}
