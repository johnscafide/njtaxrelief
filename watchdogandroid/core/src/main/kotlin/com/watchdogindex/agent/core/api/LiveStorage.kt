package com.watchdogindex.agent.core.api

import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AppSettings
import com.watchdogindex.agent.core.model.AppThemeMode
import com.watchdogindex.agent.core.model.PriceCheck
import com.watchdogindex.agent.core.model.PriceCheckKind
import com.watchdogindex.agent.core.model.PropertySummary
import com.watchdogindex.agent.core.model.QuietHours
import com.watchdogindex.agent.core.model.ScanHistoryItem
import com.watchdogindex.agent.core.model.ScanResult
import com.watchdogindex.agent.core.repo.KeyValueStore
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/*
 * What the live repositories keep on the device through the platform's KeyValueStore: things the backend has no
 * field for (per-channel switches, quiet hours, the "also send it as a notification" toggle, scan history, done
 * tasks, the push installation id). Everything is JSON with unknown keys ignored, so an older value never breaks a
 * newer build. Nothing here holds property-owner data.
 */

internal val liveJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    prettyPrint = false
}

internal object LiveKeys {
    const val APP_SETTINGS = "watchdog.live.app_settings"
    const val LOCAL_ALERTS = "watchdog.live.alert_switches"
    const val SCAN_HISTORY = "watchdog.live.scan_history"
    const val DONE_TASKS = "watchdog.live.digest_done_tasks"
    const val PUSH = "watchdog.live.push_registration"
}

internal suspend inline fun <reified T> KeyValueStore.readJson(key: String): T? =
    get(key)?.let { text -> runCatching { liveJson.decodeFromString<T>(text) }.getOrNull() }

internal suspend inline fun <reified T> KeyValueStore.writeJson(key: String, value: T?) {
    put(key, value?.let { liveJson.encodeToString(it) })
}

@Serializable
internal data class StoredLiveSettings(
    val themeMode: String = AppThemeMode.System.name,
    val hasSeenWelcome: Boolean = false,
    val extensionKeyEnabled: Boolean = false,
) {
    fun toModel() = AppSettings(
        themeMode = AppThemeMode.entries.firstOrNull { it.name.equals(themeMode, ignoreCase = true) } ?: AppThemeMode.System,
        hasSeenWelcome = hasSeenWelcome,
        extensionKeyEnabled = extensionKeyEnabled,
    )

    companion object {
        fun from(model: AppSettings) = StoredLiveSettings(model.themeMode.name, model.hasSeenWelcome, model.extensionKeyEnabled)
    }
}

/**
 * The alert switches the backend has no column for (gap-answers.md "Settings alert switches"): the notification
 * mirror of the Monday email, the four channels as Android notification channels, and quiet hours. "Client home
 * changes" and "Appeal deadlines" are additionally fanned out to `property_alert_preferences`; the other two are
 * device-only because no producer exists for them yet.
 */
@Serializable
internal data class StoredLocalAlerts(
    val mondayNotification: Boolean = true,
    val channels: Map<String, Boolean> = emptyMap(),
    val quietStartHour: Int = 21,
    val quietEndHour: Int = 7,
) {
    fun channelMap(): Map<AlertChannel, Boolean> {
        val defaults = mapOf(
            AlertChannel.ClientHomeChanges to true,
            AlertChannel.FarmSalesAndDeeds to true,
            AlertChannel.TownRatesAndRevaluations to false,
            AlertChannel.AppealDeadlines to true,
        ).toMutableMap()
        val byId = AlertChannel.entries.associateBy { it.id }
        for ((id, on) in channels) byId[id]?.let { defaults[it] = on }
        return defaults
    }

    fun quietHours() = QuietHours(quietStartHour, quietEndHour)
}

@Serializable
internal data class StoredDoneTasks(val weekStart: String = "", val ids: Set<String> = emptySet())

@Serializable
internal data class StoredPushRegistration(
    val installationId: String,
    val token: String? = null,
    val platform: String? = null,
    val registeredAtEpochSeconds: Long? = null,
)

@Serializable
internal data class StoredScanHistory(val items: List<StoredScan> = emptyList())

@Serializable
internal data class StoredScan(
    val scannedAtEpochSeconds: Long,
    val pin: String,
    val address: String,
    val town: String,
    val county: String,
    val blockLot: String,
    val summaryScore: Int? = null,
    val summaryTaxBill: Int? = null,
    val classLabel: String = "",
    val lat: Double? = null,
    val lon: Double? = null,
    val score: Int? = null,
    val verdict: String? = null,
    val taxBillYear: Int,
    val taxBill: Int? = null,
    val nextYear: Int,
    val nextYearBill: Int? = null,
    val listPrice: Int? = null,
    val priceSourceLabel: String,
    val priceCheckKind: String? = null,
    val priceCheckTitle: String? = null,
    val priceCheckBody: String? = null,
    val priceCheckExpected: Int? = null,
    val matchLabel: String? = null,
) {
    fun toModel() = ScanHistoryItem(
        result = ScanResult(
            property = PropertySummary(pin, address, town, county, blockLot, summaryScore, summaryTaxBill, classLabel, null, lat, lon),
            score = score,
            verdict = verdict,
            taxBillYear = taxBillYear,
            taxBill = taxBill,
            nextYear = nextYear,
            nextYearBill = nextYearBill,
            listPrice = listPrice,
            priceSourceLabel = priceSourceLabel,
            priceCheck = priceCheckKind?.let { kind ->
                PriceCheck(PriceCheckKind.entries.firstOrNull { it.name == kind } ?: PriceCheckKind.Unknown, priceCheckTitle ?: "", priceCheckBody ?: "", priceCheckExpected)
            },
            matchLabel = matchLabel,
        ),
        scannedAtEpochSeconds = scannedAtEpochSeconds,
    )

    companion object {
        fun from(item: ScanHistoryItem): StoredScan {
            val r = item.result
            val p = r.property
            return StoredScan(
                item.scannedAtEpochSeconds, p.pin, p.address, p.town, p.county, p.blockLot, p.score, p.taxBill, p.propertyClassLabel, p.lat, p.lon,
                r.score, r.verdict, r.taxBillYear, r.taxBill, r.nextYear, r.nextYearBill, r.listPrice, r.priceSourceLabel,
                r.priceCheck?.kind?.name, r.priceCheck?.title, r.priceCheck?.body, r.priceCheck?.expectedTax, r.matchLabel,
            )
        }
    }
}
