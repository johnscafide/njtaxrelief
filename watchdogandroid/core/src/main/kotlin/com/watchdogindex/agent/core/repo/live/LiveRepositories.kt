package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.api.AccountApi
import com.watchdogindex.agent.core.api.AlertsApi
import com.watchdogindex.agent.core.api.ClientsApi
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.DigestApi
import com.watchdogindex.agent.core.api.EdgeFunctions
import com.watchdogindex.agent.core.api.FarmApi
import com.watchdogindex.agent.core.api.IntelligenceApi
import com.watchdogindex.agent.core.api.MarketingApi
import com.watchdogindex.agent.core.api.PropertyApi
import com.watchdogindex.agent.core.api.PropertyMapper
import com.watchdogindex.agent.core.api.SiteApi
import com.watchdogindex.agent.core.api.SupabaseAuthClient
import com.watchdogindex.agent.core.api.SupabaseRest
import com.watchdogindex.agent.core.api.TokenProvider
import com.watchdogindex.agent.core.api.TokenRefresher
import com.watchdogindex.agent.core.api.WatchdogHttp
import com.watchdogindex.agent.core.api.bestEffort
import com.watchdogindex.agent.core.model.Account
import com.watchdogindex.agent.core.repo.KeyValueStore
import com.watchdogindex.agent.core.repo.Repositories
import com.watchdogindex.agent.core.session.SessionManager
import com.watchdogindex.agent.core.session.SessionStore
import io.ktor.client.HttpClient
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.toLocalDateTime

/**
 * Builds the live repositories against the production backend. The platform supplies the HTTP client (OkHttp on
 * Android, the JDK client on desktop), session persistence and key-value storage; this adds the JSON, timeout,
 * User-Agent and auth plugins to that client (Ktor keeps the engine) and wires the session manager into it.
 */
object LiveRepositories {
    fun create(config: WatchdogConfig, httpClient: HttpClient, sessionStore: SessionStore, keyValueStore: KeyValueStore): Repositories =
        create(config, httpClient, sessionStore, keyValueStore, appVersion = WatchdogHttp.DEFAULT_APP_VERSION)

    fun create(
        config: WatchdogConfig,
        httpClient: HttpClient,
        sessionStore: SessionStore,
        keyValueStore: KeyValueStore,
        appVersion: String,
        now: () -> Instant = { Clock.System.now() },
    ): LiveRepositorySet {
        var manager: SessionManager? = null
        val client = WatchdogHttp.configure(
            base = httpClient,
            config = config,
            tokens = TokenProvider { manager?.validAccessToken() },
            refresher = TokenRefresher { stale -> manager?.refresher?.refreshAfterUnauthorized(stale) },
            appVersion = appVersion,
        )
        val auth = SupabaseAuthClient(client, config, nowEpochSeconds = { now().epochSeconds })
        val session = SessionManager(auth, sessionStore, nowEpochSeconds = { now().epochSeconds })
        manager = session
        return build(config, client, session, auth, keyValueStore, now)
    }

    /** Assembles the set from an already configured client and session manager (tests use this with MockEngine). */
    fun build(config: WatchdogConfig, client: HttpClient, session: SessionManager, auth: SupabaseAuthClient, keyValueStore: KeyValueStore, now: () -> Instant): LiveRepositorySet {
        val rest = SupabaseRest(client, config)
        val edge = EdgeFunctions(client, config)
        val site = SiteApi(client, config)
        val context = LiveContext(
            config = config,
            session = session,
            rest = rest,
            edge = edge,
            site = site,
            authClient = auth,
            account = AccountApi(rest, auth),
            property = PropertyApi(site),
            mapper = PropertyMapper { now().toLocalDateTime(Derived.NEW_JERSEY).date },
            digest = DigestApi(rest),
            clients = ClientsApi(rest, edge),
            farm = FarmApi(rest, edge),
            marketing = MarketingApi(rest, edge),
            intelligence = IntelligenceApi(site, rest),
            alerts = AlertsApi(rest, edge),
            store = keyValueStore,
            now = now,
        )
        return LiveRepositorySet(context)
    }
}

/** Everything the live repositories share: the APIs, the session, the store, the clock and a short account cache. */
class LiveContext(
    val config: WatchdogConfig,
    val session: SessionManager,
    val rest: SupabaseRest,
    val edge: EdgeFunctions,
    val site: SiteApi,
    val authClient: SupabaseAuthClient,
    val account: AccountApi,
    val property: PropertyApi,
    val mapper: PropertyMapper,
    val digest: DigestApi,
    val clients: ClientsApi,
    val farm: FarmApi,
    val marketing: MarketingApi,
    val intelligence: IntelligenceApi,
    val alerts: AlertsApi,
    val store: KeyValueStore,
    val now: () -> Instant,
) {
    fun today(): LocalDate = now().toLocalDateTime(Derived.NEW_JERSEY).date

    suspend fun userId(): String = session.requireSession().userId

    private val accountMutex = Mutex()
    private var cachedAccount: Account? = null
    private var cachedAt: Instant? = null
    private var cachedFor: String? = null

    /** The account, cached for five minutes per signed-in user. */
    suspend fun account(forceRefresh: Boolean = false): Account = accountMutex.withLock {
        val current = session.requireSession()
        val fresh = cachedAccount?.takeIf { !forceRefresh && cachedFor == current.userId && cachedAt?.let { at -> (now() - at).inWholeSeconds < ACCOUNT_CACHE_SECONDS } == true }
        if (fresh != null) return fresh
        val loaded = account.account(current)
        cachedAccount = loaded
        cachedAt = now()
        cachedFor = current.userId
        loaded
    }

    /** The sphere pins (saved and farm homes) for Intelligence context, cached briefly. */
    private var cachedPins: List<String>? = null
    private var pinsAt: Instant? = null

    suspend fun spherePins(): List<String> {
        val cached = cachedPins
        if (cached != null && pinsAt?.let { (now() - it).inWholeSeconds < ACCOUNT_CACHE_SECONDS } == true) return cached
        val pins = bestEffort { digest.sphere().pins } ?: emptyList()
        cachedPins = pins
        pinsAt = now()
        return pins
    }

    fun forgetCaches() {
        cachedAccount = null
        cachedAt = null
        cachedPins = null
        pinsAt = null
    }

    companion object {
        const val ACCOUNT_CACHE_SECONDS = 300
    }
}

/** The concrete set, exposed so the platform can reach live-only helpers (for example the checkup share text). */
class LiveRepositorySet(val context: LiveContext) : Repositories {
    override val settings = LiveSettingsRepository(context)
    override val alerts = LiveAlertsRepository(context)
    override val auth = LiveAuthRepository(context, beforeSignOut = { alerts.forgetPushRegistration() }, onRestore = { settings.load() })
    override val digest = LiveDigestRepository(context)
    override val properties = LivePropertyRepository(context)
    override val scan = LiveScanRepository(context, properties)
    override val clients = LiveClientsRepository(context)
    override val farm = LiveFarmRepository(context)
    override val marketing = LiveMarketingRepository(context)
    override val intelligence = LiveIntelligenceRepository(context, digest)
}
