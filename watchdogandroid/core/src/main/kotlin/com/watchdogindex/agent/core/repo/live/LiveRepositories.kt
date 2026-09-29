package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.repo.KeyValueStore
import com.watchdogindex.agent.core.repo.Repositories
import com.watchdogindex.agent.core.session.SessionStore
import io.ktor.client.HttpClient

/**
 * Builds the live repositories against the production backend. The platform supplies the HTTP client
 * (OkHttp on Android, the JDK client on desktop), session persistence and key-value storage.
 */
object LiveRepositories {
    fun create(config: WatchdogConfig, httpClient: HttpClient, sessionStore: SessionStore, keyValueStore: KeyValueStore): Repositories =
        throw NotImplementedError("Live repositories are being built; use SampleRepositories meanwhile.")
}
