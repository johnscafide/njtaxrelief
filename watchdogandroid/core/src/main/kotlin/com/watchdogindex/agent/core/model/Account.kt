package com.watchdogindex.agent.core.model

/** The signed-in agent. Never carries public-record owner data; this is the agent's own account. */
data class Account(
    val userId: String,
    val email: String,
    val displayName: String,
    val brokerage: String?,
    val planLabel: String,
    val planTier: String?,
    val subscriptionStatus: String?,
    val isAgentPlan: Boolean,
    val vanitySlug: String?,
    val phone: String? = null,
) {
    val initials: String
        get() = displayName.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { email.take(2).uppercase() }
}

data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long,
    val userId: String,
    val email: String,
)

sealed interface AuthState {
    data object Unknown : AuthState
    data object SignedOut : AuthState
    data class CodeSent(val email: String) : AuthState
    data class SignedIn(val session: AuthSession) : AuthState
}
