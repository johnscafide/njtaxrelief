package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.api.LiveKeys
import com.watchdogindex.agent.core.api.StoredLiveSettings
import com.watchdogindex.agent.core.api.readJson
import com.watchdogindex.agent.core.api.writeJson
import com.watchdogindex.agent.core.model.AppSettings
import com.watchdogindex.agent.core.repo.SettingsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** App settings live only on the device, as JSON in the platform's KeyValueStore. */
class LiveSettingsRepository(private val ctx: LiveContext) : SettingsRepository {
    private val state = MutableStateFlow(AppSettings())
    override val settings: StateFlow<AppSettings> = state.asStateFlow()
    private val mutex = Mutex()
    private var loaded = false

    suspend fun load() = mutex.withLock {
        if (loaded) return@withLock
        ctx.store.readJson<StoredLiveSettings>(LiveKeys.APP_SETTINGS)?.let { state.value = it.toModel() }
        loaded = true
    }

    override suspend fun update(transform: (AppSettings) -> AppSettings) {
        load()
        val next = transform(state.value)
        state.value = next
        ctx.store.writeJson(LiveKeys.APP_SETTINGS, StoredLiveSettings.from(next))
    }
}
