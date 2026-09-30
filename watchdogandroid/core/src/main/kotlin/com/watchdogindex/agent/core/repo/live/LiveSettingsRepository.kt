package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.api.LiveKeys
import com.watchdogindex.agent.core.api.StoredLiveSettings
import com.watchdogindex.agent.core.api.readJson
import com.watchdogindex.agent.core.api.writeJson
import com.watchdogindex.agent.core.model.AppSettings
import com.watchdogindex.agent.core.repo.SettingsRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.FlowCollector
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * App settings live only on the device, as JSON in the platform's KeyValueStore. The stored value is read once,
 * lazily and inside core, so no host call is needed for it to land: before the first emission to any collector
 * of [settings] (the theme in `WatchdogTheme`, the Welcome flag), before the first [update], and when the session
 * is restored at launch (`LiveAuthRepository.restore`, which the splash already waits for). A forced Light or
 * Dark theme therefore survives a cold start instead of reverting to System until a setting is touched.
 */
class LiveSettingsRepository(private val ctx: LiveContext) : SettingsRepository {
    private val state = MutableStateFlow(AppSettings())
    override val settings: StateFlow<AppSettings> = LoadFirstStateFlow(state.asStateFlow()) { load() }
    private val mutex = Mutex()
    private var loaded = false

    /**
     * Reads the stored settings once; safe to call repeatedly and from several coroutines. A store that cannot be
     * read right now leaves the defaults in place and is tried again on the next call.
     */
    suspend fun load() = mutex.withLock {
        if (loaded) return@withLock
        val stored = try {
            ctx.store.readJson<StoredLiveSettings>(LiveKeys.APP_SETTINGS)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return@withLock
        }
        stored?.let { state.value = it.toModel() }
        loaded = true
    }

    override suspend fun update(transform: (AppSettings) -> AppSettings) {
        load()
        val next = transform(state.value)
        state.value = next
        ctx.store.writeJson(LiveKeys.APP_SETTINGS, StoredLiveSettings.from(next))
    }
}

/**
 * A read-only view of [source] that runs [beforeCollect] before a collector sees anything, so the first value a
 * screen collects is the stored one, not the default. [value] is whatever is loaded so far.
 */
private class LoadFirstStateFlow<T>(private val source: StateFlow<T>, private val beforeCollect: suspend () -> Unit) : StateFlow<T> {
    override val value: T get() = source.value
    override val replayCache: List<T> get() = source.replayCache
    override suspend fun collect(collector: FlowCollector<T>): Nothing {
        beforeCollect()
        source.collect(collector)
    }
}
