package com.watchdogindex.agent.core.repo

import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AnalystAnswer
import com.watchdogindex.agent.core.model.AppNotification
import com.watchdogindex.agent.core.model.AppSettings
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.core.model.Brief
import com.watchdogindex.agent.core.model.Campaign
import com.watchdogindex.agent.core.model.ClientFilter
import com.watchdogindex.agent.core.model.ClientImportRow
import com.watchdogindex.agent.core.model.ClientsOverview
import com.watchdogindex.agent.core.model.Farm
import com.watchdogindex.agent.core.model.FarmStats
import com.watchdogindex.agent.core.model.LatLng
import com.watchdogindex.agent.core.model.MapLayer
import com.watchdogindex.agent.core.model.MapParcel
import com.watchdogindex.agent.core.model.PamsPin
import com.watchdogindex.agent.core.model.PropertyDetail
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.ScanHistoryItem
import com.watchdogindex.agent.core.model.ScanInput
import com.watchdogindex.agent.core.model.ScanResult
import com.watchdogindex.agent.core.model.TrueCostCard
import com.watchdogindex.agent.core.model.TrueCostInputs
import com.watchdogindex.agent.core.model.WeekDigest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/*
 * Repository contracts. Every method is a suspend call that throws WatchdogException (or a subclass) on
 * failure. Each has a Live implementation (real backend) and a Sample implementation (the fictional data
 * set from the approved mockups) so the UI, previews, screenshots and tests never depend on the network.
 */

interface AuthRepository {
    val state: StateFlow<AuthState>
    /** Sends the six-digit email code, the same flow the website's Agent Desk uses. */
    suspend fun sendCode(email: String)
    suspend fun verifyCode(email: String, code: String)
    /** Passkey sign-in; only offered when the platform supports it and the backend has one enrolled. */
    suspend fun signInWithPasskey()
    suspend fun signOut()
    suspend fun account(): Account
    /** Restores a stored session on launch, refreshing it if needed. */
    suspend fun restore()
}

interface DigestRepository {
    suspend fun thisWeek(): WeekDigest
    suspend fun markTaskDone(taskId: String, done: Boolean)
}

interface PropertyRepository {
    suspend fun search(query: String): List<PropertySummary>
    suspend fun detail(pin: PamsPin): PropertyDetail
    suspend fun setSaved(pin: PamsPin, saved: Boolean)
    suspend fun setWatched(pin: PamsPin, watched: Boolean)
    /** Public checkup link the agent sends under their own name (/checkup?pin=...&agent=...). */
    suspend fun checkupLink(pin: PamsPin): String
}

interface ScanRepository {
    suspend fun resolve(input: ScanInput): ScanResult
    suspend fun history(): List<ScanHistoryItem>
}

interface ClientsRepository {
    suspend fun overview(filter: ClientFilter = ClientFilter.All, query: String = ""): ClientsOverview
    suspend fun sendCheckup(clientId: String)
    suspend fun sendAllReadyCheckups(): Int
    suspend fun snooze(clientId: String)
    suspend fun import(rows: List<ClientImportRow>): Int
}

interface FarmRepository {
    suspend fun farms(): List<Farm>
    suspend fun parcels(farmId: String, layer: MapLayer): List<MapParcel>
    suspend fun stats(farmId: String): FarmStats
    suspend fun createFarm(name: String, boundary: List<LatLng>): Farm
}

interface MarketingRepository {
    suspend fun campaigns(): List<Campaign>
    suspend fun trueCostCard(pin: PamsPin, inputs: TrueCostInputs?, includeContactCard: Boolean): TrueCostCard
}

interface IntelligenceRepository {
    suspend fun brief(): Brief
    suspend fun ask(question: String): AnalystAnswer
}

interface AlertsRepository {
    val preferences: StateFlow<AlertPreferences>
    suspend fun refresh()
    suspend fun update(preferences: AlertPreferences)
    suspend fun registerPushToken(token: String, platform: String = "android")
    suspend fun unregisterPushToken(token: String)
    /** Recent alerts for the in-app list. */
    suspend fun recent(): List<AppNotification>
}

interface SettingsRepository {
    val settings: StateFlow<AppSettings>
    suspend fun update(transform: (AppSettings) -> AppSettings)
}

/** Everything a screen can reach. Built once per process by the Android app or the desktop preview. */
interface Repositories {
    val auth: AuthRepository
    val digest: DigestRepository
    val properties: PropertyRepository
    val scan: ScanRepository
    val clients: ClientsRepository
    val farm: FarmRepository
    val marketing: MarketingRepository
    val intelligence: IntelligenceRepository
    val alerts: AlertsRepository
    val settings: SettingsRepository
}

/** Small key-value persistence the platform provides (DataStore on Android, a JSON file on desktop). */
interface KeyValueStore {
    suspend fun get(key: String): String?
    suspend fun put(key: String, value: String?)
    fun observe(key: String): Flow<String?>
}
