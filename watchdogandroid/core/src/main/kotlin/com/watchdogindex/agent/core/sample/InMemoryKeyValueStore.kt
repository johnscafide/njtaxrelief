package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.repo.KeyValueStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update

/**
 * A KeyValueStore that lives for the process: used by previews, tests and the sample repositories when the
 * platform does not supply DataStore or a file. Safe to share between coroutines; every write replaces the
 * whole map atomically, and [observe] emits on each change of the watched key.
 */
class InMemoryKeyValueStore(initial: Map<String, String> = emptyMap()) : KeyValueStore {
    private val state = MutableStateFlow(initial)

    override suspend fun get(key: String): String? = state.value[key]

    override suspend fun put(key: String, value: String?) {
        state.update { current -> if (value == null) current - key else current + (key to value) }
    }

    override fun observe(key: String): Flow<String?> = state.map { it[key] }.distinctUntilChanged()

    /** Everything stored right now, for tests and debugging. */
    fun snapshot(): Map<String, String> = state.value
}
