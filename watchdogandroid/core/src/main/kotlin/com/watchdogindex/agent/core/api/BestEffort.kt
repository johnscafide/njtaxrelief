package com.watchdogindex.agent.core.api

import kotlinx.coroutines.CancellationException

/**
 * Runs a call whose failure is tolerable and returns null when it fails, the way `runCatching { }.getOrNull()`
 * does, with one difference that matters inside coroutines: a [CancellationException] is rethrown. `runCatching`
 * catches it like any other throwable, so a screen that left (and cancelled its ViewModel scope) would keep
 * running the rest of a repository call, writing state nobody asked for. Inline, so suspend calls work inside.
 */
internal inline fun <T> bestEffort(block: () -> T): T? = try {
    block()
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    null
}
