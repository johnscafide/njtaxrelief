package com.watchdogindex.agent.core.session

import com.watchdogindex.agent.core.model.AuthSession

/** Persists the Supabase session. Android: DataStore excluded from backups. Desktop: a file in the user's home. */
interface SessionStore {
    suspend fun load(): AuthSession?
    suspend fun save(session: AuthSession?)
}

class InMemorySessionStore(private var session: AuthSession? = null) : SessionStore {
    override suspend fun load(): AuthSession? = session
    override suspend fun save(session: AuthSession?) { this.session = session }
}
