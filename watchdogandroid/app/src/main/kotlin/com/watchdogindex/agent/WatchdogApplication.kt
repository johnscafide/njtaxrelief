package com.watchdogindex.agent

import android.app.Application
import android.util.Log
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.watchdogindex.agent.android.AndroidPlatformServices
import com.watchdogindex.agent.android.DataStoreKeyValueStore
import com.watchdogindex.agent.android.DataStoreSessionStore
import com.watchdogindex.agent.android.watchdogPrefsDataStore
import com.watchdogindex.agent.android.watchdogSessionDataStore
import com.watchdogindex.agent.app.AppGraph
import com.watchdogindex.agent.core.WatchdogConfig
import com.watchdogindex.agent.core.model.AuthState
import com.watchdogindex.agent.core.repo.Repositories
import com.watchdogindex.agent.core.repo.live.LiveRepositories
import com.watchdogindex.agent.core.sample.SampleRepositories
import com.watchdogindex.agent.push.NotificationChannels
import com.watchdogindex.agent.push.PushRegistrar
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import com.watchdogindex.agent.shared.R as SharedR

/** The Android object graph: what [AppGraph] promises the shared UI, plus the Android-only services the app itself uses. */
class AndroidAppGraph(
    override val repos: Repositories,
    override val platform: AndroidPlatformServices,
    override val fontFamily: FontFamily,
    val push: PushRegistrar,
    /** True while the live repositories are not available and the app runs on the approved sample data set. */
    val usingSampleData: Boolean,
) : AppGraph

/**
 * Builds the graph once per process: the Ktor client, the two DataStore-backed stores, platform services,
 * the bundled Plus Jakarta Sans and the repositories. Notification channels are created here so they exist
 * before the first push arrives, and the stored session is restored so MainActivity can pick the start screen.
 */
class WatchdogApplication : Application() {
    lateinit var graph: AndroidAppGraph
        private set

    /** Lives as long as the process; used for restore, push registration and other background work. */
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _sessionRestored = MutableStateFlow(false)
    /** Flips once AuthRepository.restore() has finished (or failed); the splash waits for it, briefly. */
    val sessionRestored: StateFlow<Boolean> = _sessionRestored.asStateFlow()

    override fun onCreate() {
        super.onCreate()
        NotificationChannels.ensure(this)

        val keyValueStore = DataStoreKeyValueStore(watchdogPrefsDataStore)
        val sessionStore = DataStoreSessionStore(watchdogSessionDataStore)
        val httpClient = buildHttpClient()

        var sample = false
        val repos: Repositories = try {
            LiveRepositories.create(
                config = WatchdogConfig.Production,
                httpClient = httpClient,
                sessionStore = sessionStore,
                keyValueStore = keyValueStore,
            )
        } catch (e: NotImplementedError) {
            // The live repositories are still being built. Until they land the app runs on the approved sample
            // data set, persisted through DataStore; signedIn = false so the first run starts on Welcome.
            Log.w(TAG, "Live repositories unavailable; running on sample data", e)
            sample = true
            SampleRepositories(store = keyValueStore, signedIn = false)
        }

        val platform = AndroidPlatformServices(this)
        val push = PushRegistrar(this, repos)
        graph = AndroidAppGraph(
            repos = repos,
            platform = platform,
            fontFamily = plusJakartaSans(),
            push = push,
            usingSampleData = sample,
        )

        appScope.launch {
            try { repos.auth.restore() } catch (e: Exception) { Log.w(TAG, "Session restore failed", e) }
            _sessionRestored.value = true
        }
        // Register the push token whenever the agent becomes signed in (also refreshes it on every launch).
        appScope.launch {
            repos.auth.state.map { it is AuthState.SignedIn }.distinctUntilChanged().collect { signedIn ->
                if (signedIn) push.register()
            }
        }
    }

    /**
     * Ktor on the OkHttp engine with JSON and a 20 s ceiling. The engine is named explicitly (and depended on in
     * app/build.gradle.kts) rather than found through Ktor's ServiceLoader lookup, which R8 can break in the
     * minified release build; proguard-rules.pro also keeps the engine container as a second guard.
     */
    private fun buildHttpClient(): HttpClient = HttpClient(OkHttp) {
        expectSuccess = false
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                    encodeDefaults = true
                    explicitNulls = false
                },
            )
        }
        install(HttpTimeout) {
            requestTimeoutMillis = 20_000
            connectTimeoutMillis = 20_000
            socketTimeoutMillis = 20_000
        }
    }

    /** Plus Jakarta Sans 400-800 from the shared library's font resources (nonTransitiveRClass: use the library R). */
    private fun plusJakartaSans(): FontFamily = FontFamily(
        Font(SharedR.font.plus_jakarta_sans_400, FontWeight.Normal),
        Font(SharedR.font.plus_jakarta_sans_500, FontWeight.Medium),
        Font(SharedR.font.plus_jakarta_sans_600, FontWeight.SemiBold),
        Font(SharedR.font.plus_jakarta_sans_700, FontWeight.Bold),
        Font(SharedR.font.plus_jakarta_sans_800, FontWeight.ExtraBold),
    )

    private companion object {
        const val TAG = "Watchdog"
    }
}
