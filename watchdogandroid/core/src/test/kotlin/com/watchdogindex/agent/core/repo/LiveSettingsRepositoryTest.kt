package com.watchdogindex.agent.core.repo

import com.watchdogindex.agent.core.api.FakeServer
import com.watchdogindex.agent.core.api.LiveKeys
import com.watchdogindex.agent.core.api.StoredLiveSettings
import com.watchdogindex.agent.core.api.TestConfig
import com.watchdogindex.agent.core.api.liveJson
import com.watchdogindex.agent.core.model.AppSettings
import com.watchdogindex.agent.core.model.AppThemeMode
import com.watchdogindex.agent.core.sample.InMemoryKeyValueStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Stored app settings come back on a cold start without any call from the host: the first value a collector sees
 * is the stored one, the session restore loads them under the splash, and an update never drops what was stored.
 */
class LiveSettingsRepositoryTest {

    private fun storeWith(settings: StoredLiveSettings) = InMemoryKeyValueStore(mapOf(LiveKeys.APP_SETTINGS to liveJson.encodeToString(settings)))

    private val dark = StoredLiveSettings(themeMode = "Dark", hasSeenWelcome = true, extensionKeyEnabled = false)

    @Test
    fun `the first value a collector sees is the stored one, not the default`() = runBlocking {
        val set = TestConfig.liveSet(FakeServer(), storeWith(dark))
        assertEquals(AppSettings(AppThemeMode.Dark, hasSeenWelcome = true, extensionKeyEnabled = false), set.settings.settings.first())
        assertEquals(AppThemeMode.Dark, set.settings.settings.value.themeMode, "once loaded, the plain value reads the stored theme too")
    }

    @Test
    fun `restoring the session at launch loads the stored settings before anything collects`() = runBlocking {
        val set = TestConfig.liveSet(FakeServer(), storeWith(dark))
        assertEquals(AppThemeMode.System, set.settings.settings.value.themeMode, "nothing has read the store yet")
        set.auth.restore()
        assertEquals(AppThemeMode.Dark, set.settings.settings.value.themeMode, "the splash waits for restore, so the first frame is already dark")
        assertTrue(set.settings.settings.value.hasSeenWelcome)
    }

    @Test
    fun `an update keeps what was stored and writes the merged value back`() = runBlocking {
        val store = storeWith(dark)
        val set = TestConfig.liveSet(FakeServer(), store)
        set.settings.update { it.copy(extensionKeyEnabled = true) }
        assertEquals(AppSettings(AppThemeMode.Dark, hasSeenWelcome = true, extensionKeyEnabled = true), set.settings.settings.value)
        val written = liveJson.decodeFromString(StoredLiveSettings.serializer(), store.snapshot().getValue(LiveKeys.APP_SETTINGS))
        assertEquals(StoredLiveSettings("Dark", hasSeenWelcome = true, extensionKeyEnabled = true), written)
    }

    @Test
    fun `with nothing stored the defaults apply and an unknown theme name falls back to System`() = runBlocking {
        assertEquals(AppSettings(), TestConfig.liveSet(FakeServer(), InMemoryKeyValueStore()).settings.settings.first())
        val odd = InMemoryKeyValueStore(mapOf(LiveKeys.APP_SETTINGS to """{"themeMode":"Sepia","hasSeenWelcome":true,"future_key":1}"""))
        assertEquals(AppSettings(AppThemeMode.System, hasSeenWelcome = true), TestConfig.liveSet(FakeServer(), odd).settings.settings.first())
    }
}
