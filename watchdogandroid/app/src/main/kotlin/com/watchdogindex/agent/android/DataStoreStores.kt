package com.watchdogindex.agent.android

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.watchdogindex.agent.core.model.AuthSession
import com.watchdogindex.agent.core.repo.KeyValueStore
import com.watchdogindex.agent.core.session.SessionStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException

/*
 * Two DataStore<Preferences> files, created once per process:
 *  - watchdog_prefs: small app state (sample repositories' settings, alert preferences, remembered choices).
 *  - watchdog_session: the Supabase session only. backup_rules.xml and data_extraction_rules.xml exclude
 *    datastore/watchdog_session.preferences_pb, so tokens never leave the device through backups.
 */

val Context.watchdogPrefsDataStore: DataStore<Preferences> by preferencesDataStore(name = "watchdog_prefs")
val Context.watchdogSessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "watchdog_session")

/** A read that survives a corrupt or unreadable file: IO problems read as empty preferences. */
private fun DataStore<Preferences>.safeData(): Flow<Preferences> =
    data.catch { error -> if (error is IOException) emit(emptyPreferences()) else throw error }

/** [KeyValueStore] on DataStore. Keys are stored verbatim as string preferences. */
class DataStoreKeyValueStore(private val dataStore: DataStore<Preferences>) : KeyValueStore {
    override suspend fun get(key: String): String? = dataStore.safeData().first()[stringPreferencesKey(key)]

    override suspend fun put(key: String, value: String?) {
        val prefKey = stringPreferencesKey(key)
        dataStore.edit { prefs -> if (value == null) prefs.remove(prefKey) else prefs[prefKey] = value }
    }

    override fun observe(key: String): Flow<String?> {
        val prefKey = stringPreferencesKey(key)
        return dataStore.safeData().map { it[prefKey] }.distinctUntilChanged()
    }
}

/** [SessionStore] on the session DataStore: the whole [AuthSession] as one JSON string under one key. */
class DataStoreSessionStore(private val dataStore: DataStore<Preferences>) : SessionStore {
    private val key = stringPreferencesKey("auth_session")

    override suspend fun load(): AuthSession? {
        val text = dataStore.safeData().first()[key] ?: return null
        return runCatching { json.decodeFromString(StoredAuthSession.serializer(), text).toModel() }.getOrNull()
    }

    override suspend fun save(session: AuthSession?) {
        dataStore.edit { prefs ->
            if (session == null) prefs.remove(key)
            else prefs[key] = json.encodeToString(StoredAuthSession.serializer(), StoredAuthSession.from(session))
        }
    }

    /** Serializable mirror of [AuthSession]; the domain model in core stays a plain data class. */
    @Serializable
    private data class StoredAuthSession(
        val accessToken: String,
        val refreshToken: String,
        val expiresAtEpochSeconds: Long,
        val userId: String,
        val email: String,
    ) {
        fun toModel() = AuthSession(accessToken, refreshToken, expiresAtEpochSeconds, userId, email)

        companion object {
            fun from(s: AuthSession) = StoredAuthSession(s.accessToken, s.refreshToken, s.expiresAtEpochSeconds, s.userId, s.email)
        }
    }

    private companion object {
        val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }
}
