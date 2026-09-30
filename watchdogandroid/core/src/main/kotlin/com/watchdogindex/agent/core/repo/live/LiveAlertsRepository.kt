package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.PlanRequiredException
import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.AlertsApi
import com.watchdogindex.agent.core.api.Derived
import com.watchdogindex.agent.core.api.DigestApi
import com.watchdogindex.agent.core.api.HttpFailureException
import com.watchdogindex.agent.core.api.LiveKeys
import com.watchdogindex.agent.core.api.StoredLocalAlerts
import com.watchdogindex.agent.core.api.StoredPushRegistration
import com.watchdogindex.agent.core.api.readJson
import com.watchdogindex.agent.core.api.writeJson
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppNotification
import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind
import com.watchdogindex.agent.core.repo.AlertsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Instant
import java.util.UUID

/**
 * Alert preferences and push (gap-answers.md "Settings alert switches" 6; database-and-push.md 8.4):
 *
 * - Monday email and its delivery time come from `agent_digest_preferences`; no row means on, Mondays at 8:00 AM.
 * - The four channel switches, quiet hours and "also send it as a notification" are stored on the device (no
 *   server field exists). "Client home changes" and "Appeal deadlines" also patch the `property_alert_preferences`
 *   rows that already exist (never creating one), and the displayed state follows those rows when they exist.
 * - Push registration goes through the `push-device-register` edge function with a stable installation id; the
 *   function is still a proposal, so a missing function surfaces as a plain error and never blocks anything else.
 */
class LiveAlertsRepository(private val ctx: LiveContext) : AlertsRepository {

    private val state = MutableStateFlow(AlertPreferences())
    override val preferences: StateFlow<AlertPreferences> = state.asStateFlow()
    private var digestRow: AlertsApi.DigestPreference? = null

    override suspend fun refresh() {
        val local = ctx.store.readJson<StoredLocalAlerts>(LiveKeys.LOCAL_ALERTS) ?: StoredLocalAlerts()
        val digest = try { ctx.alerts.digestPreference() } catch (e: PlanRequiredException) { null } catch (e: HttpFailureException) { null }
        digestRow = digest
        val channels = local.channelMap().toMutableMap()
        val pinRows = runCatching { ctx.alerts.pinPreferences() }.getOrDefault(emptyList())
        if (pinRows.isNotEmpty()) {
            channels[AlertChannel.ClientHomeChanges] = pinRows.none { !it.alertTax || !it.alertAssessment }
            channels[AlertChannel.AppealDeadlines] = pinRows.none { !it.alertDeadline }
        }
        state.value = AlertPreferences(
            mondayEmail = digest?.enabled ?: true,
            mondayNotification = local.mondayNotification,
            deliveryLabel = deliveryLabel(digest?.weekday ?: 1, digest?.localHour ?: 8),
            timeZone = digest?.timezone ?: "America/New_York",
            channels = channels,
            quietHours = local.quietHours(),
        )
    }

    override suspend fun update(preferences: AlertPreferences) {
        val before = state.value
        val userId = ctx.userId()
        val now = ctx.now()
        ctx.store.writeJson(LiveKeys.LOCAL_ALERTS, StoredLocalAlerts(
            mondayNotification = preferences.mondayNotification,
            channels = preferences.channels.entries.associate { (c, on) -> c.id to on },
            quietStartHour = preferences.quietHours.startHour,
            quietEndHour = preferences.quietHours.endHour,
        ))
        if (preferences.mondayEmail != before.mondayEmail) {
            try {
                ctx.alerts.saveDigestPreference(userId, preferences.mondayEmail, digestRow?.weekday, digestRow?.localHour, digestRow?.timezone, now)
                // The row exists now, so the next flip is a change against this value rather than a rewrite on every update.
                digestRow = (digestRow ?: AlertsApi.DigestPreference()).copy(enabled = preferences.mondayEmail)
            } catch (e: PlanRequiredException) {
                // Free accounts have no digest row and the RLS says so; the switch stays local.
            }
        }
        val homeChanges = preferences.channels[AlertChannel.ClientHomeChanges] ?: true
        val deadlines = preferences.channels[AlertChannel.AppealDeadlines] ?: true
        if (homeChanges != (before.channels[AlertChannel.ClientHomeChanges] ?: true) || deadlines != (before.channels[AlertChannel.AppealDeadlines] ?: true)) {
            // A category switch changes what the existing per-pin rows say; it never enrols the farm and sphere pins
            // that have no row, so only pins with a preference row are patched.
            val pins = runCatching { ctx.alerts.pinPreferences() }.getOrDefault(emptyList()).map { it.pamsPin }
            if (pins.isNotEmpty()) {
                runCatching { ctx.alerts.updatePinPreferences(userId, pins, alertTax = homeChanges, alertAssessment = homeChanges, alertScore = homeChanges, alertDeadline = deadlines, now = now) }
            }
        }
        state.value = preferences.copy(deliveryLabel = before.deliveryLabel, timeZone = before.timeZone)
        mirrorToPush(preferences)
    }

    private suspend fun mirrorToPush(preferences: AlertPreferences) {
        val stored = ctx.store.readJson<StoredPushRegistration>(LiveKeys.PUSH) ?: return
        if (stored.token == null) return
        runCatching { ctx.alerts.updateRegistration(registration(stored, preferences, stored.platform ?: "android")) }
    }

    private fun registration(stored: StoredPushRegistration, preferences: AlertPreferences, platform: String) = AlertsApi.PushRegistration(
        installationId = stored.installationId,
        token = stored.token,
        platform = platform,
        appVersion = null,
        timezone = preferences.timeZone,
        quietStartHour = preferences.quietHours.startHour,
        quietEndHour = preferences.quietHours.endHour,
        alertsEnabled = preferences.channels.values.any { it },
        digestEnabled = preferences.mondayNotification,
    )

    override suspend fun registerPushToken(token: String, platform: String) {
        if (token.isBlank()) throw WatchdogException("Empty push token")
        val stored = ctx.store.readJson<StoredPushRegistration>(LiveKeys.PUSH) ?: StoredPushRegistration(UUID.randomUUID().toString().replace("-", ""))
        val heartbeat = stored.token != null
        val next = stored.copy(token = token, platform = platform)
        try {
            ctx.alerts.register(registration(next, state.value, platform), heartbeat)
        } catch (e: HttpFailureException) {
            if (e.status == 404) throw WatchdogException("push-device-register missing", e, "Notifications aren’t switched on for this build yet.")
            throw e
        }
        ctx.store.writeJson(LiveKeys.PUSH, next.copy(registeredAtEpochSeconds = ctx.now().epochSeconds))
    }

    override suspend fun unregisterPushToken(token: String) {
        val stored = ctx.store.readJson<StoredPushRegistration>(LiveKeys.PUSH) ?: return
        try {
            ctx.alerts.unregister(stored.installationId)
        } finally {
            ctx.store.writeJson(LiveKeys.PUSH, stored.copy(token = null, registeredAtEpochSeconds = null))
        }
    }

    /** Called on sign-out: tells the server this installation is gone and forgets the token. Never throws. */
    suspend fun forgetPushRegistration() {
        val stored = ctx.store.readJson<StoredPushRegistration>(LiveKeys.PUSH) ?: return
        if (stored.token != null) runCatching { ctx.alerts.unregister(stored.installationId) }
        ctx.store.writeJson(LiveKeys.PUSH, stored.copy(token = null, registeredAtEpochSeconds = null))
    }

    /** The in-app list: the agent's own `property_update_events`, newest first, routine refreshes hidden. */
    override suspend fun recent(): List<AppNotification> {
        val now = ctx.now()
        val since = Instant.fromEpochSeconds(now.epochSeconds - 30 * 86_400L)
        val events = ctx.digest.events(since, limit = 100).filter { it.eventType in DigestApi.WEIGHTS }
        val sphere = runCatching { ctx.digest.sphere() }.getOrNull()
        return events.take(50).map { event ->
            val home = sphere?.match(event)
            val address = home?.address?.let { Derived.titleCase(it) } ?: event.payloadAddress?.let { Derived.titleCase(it) }
            val town = home?.town?.let { Derived.titleCase(it) } ?: event.payloadTown?.let { Derived.titleCase(it) }
            val where = listOfNotNull(address, town).joinToString(", ")
            val channel = channelFor(event.eventType)
            val title = if (where.isNotEmpty()) "${ctx.digest.title(event)} at $where" else ctx.digest.title(event)
            val actions = mutableListOf(NotificationAction(NotificationActionKind.Open, "Open"))
            if (event.eventType == "tax_change" && home?.relationship == "past_client") actions += NotificationAction(NotificationActionKind.CallClient, "Call client")
            if (event.eventType == "deed_change" && home?.relationship == "farm") actions += NotificationAction(NotificationActionKind.ViewFarm, "View farm")
            AppNotification(
                id = "evt-${event.id ?: event.hashCode()}",
                channel = channel,
                title = title,
                body = event.summary?.takeIf { it.isNotBlank() } ?: DigestApi.TYPE_LABELS[event.eventType] ?: "",
                timeLabel = event.occurred?.let { Derived.relativeTimeLabel(it, now) } ?: "",
                pin = event.pin,
                actions = actions,
            )
        }
    }

    companion object {
        fun deliveryLabel(weekday: Int, hour: Int): String {
            val day = DayOfWeek.entries.getOrNull(if (weekday == 0) 6 else weekday - 1) ?: DayOfWeek.MONDAY
            return "${Format.weekday(day)}s at ${Format.time12h(hour)}"
        }

        fun channelFor(eventType: String): AlertChannel = when (eventType) {
            "deed_change" -> AlertChannel.FarmSalesAndDeeds
            "municipal_change" -> AlertChannel.TownRatesAndRevaluations
            "appeal_deadline" -> AlertChannel.AppealDeadlines
            else -> AlertChannel.ClientHomeChanges
        }
    }
}
