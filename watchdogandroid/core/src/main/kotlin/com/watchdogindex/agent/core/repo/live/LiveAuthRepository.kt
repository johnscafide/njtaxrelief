package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.core.repo.AuthRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/**
 * Sign-in with the six-digit email code (auth-and-account.md 2, 14), session restore and the account. Passkeys
 * throw: the backend has no WebAuthn (gap-answers.md "Welcome CTAs" A1), so the Welcome screen hides the button.
 */
class LiveAuthRepository(private val ctx: LiveContext, private val beforeSignOut: suspend () -> Unit = {}) : AuthRepository {
    override val state: StateFlow<AuthState> = ctx.session.state

    override suspend fun sendCode(email: String) = ctx.session.sendCode(email)

    override suspend fun verifyCode(email: String, code: String) {
        ctx.session.verifyCode(email, code)
        ctx.forgetCaches()
    }

    override suspend fun signInWithPasskey() {
        throw WatchdogException("Passkeys are not enabled", userMessage = "Passkeys aren’t available yet. Use your email code.")
    }

    override suspend fun signOut() {
        try {
            beforeSignOut()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // The hook (forgetting the push registration) is best effort and must never keep the agent signed in.
        }
        try {
            ctx.session.signOut("local")
        } finally {
            ctx.forgetCaches()
        }
    }

    override suspend fun account(): Account = ctx.account()

    override suspend fun restore() = ctx.session.restore()
}
