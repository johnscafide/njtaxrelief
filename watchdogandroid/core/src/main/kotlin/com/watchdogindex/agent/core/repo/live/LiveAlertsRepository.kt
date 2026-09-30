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
import com.watchdogindex.agent.core.api.bestEffort
import com.watchdogindex.agent.core.api.readJson
import com.watchdogindex.agent.core.api.writeJson
import com.watchdogindex.agent.core.format.Format
import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppNotification
import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind
import com.watchdogindex.agent.core.repo.AlertsRepository
import kotlinx.coroutines.CancellationException
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
 *   The launch-time heartbeat carries no preference fields, so it can never overwrite the agent's saved switches.
 *
 * Saving is server first, device second: nothing is kept on the device until the rows the server owns have taken
 * the change, so a switch the screen reports as not saved never comes back as saved on the next load.
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
        val pinRows = bestEffort { ctx.alerts.pinPreferences() } ?: emptyList()
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

    /**
     * Server first, device second. The Monday email row and the per-pin rows are written before anything is kept on
     * this device, so a failure leaves both sides where they were and the state the screen reverts to is the truth.
     * When the per-pin patch fails after the Monday email saved, what did save is kept and published, only the two
     * category switches stay as they were, and the error carries on to the screen.
     */
    override suspend fun update(preferences: AlertPreferences) {
        val before = state.value
        val userId = ctx.userId()
        val now = ctx.now()
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
        val homeChangesBefore = before.channels[AlertChannel.ClientHomeChanges] ?: true
        val deadlinesBefore = before.channels[AlertChannel.AppealDeadlines] ?: true
        if (homeChanges != homeChangesBefore || deadlines != deadlinesBefore) {
            try {
                // A category switch changes what the existing per-pin rows say; it never enrols the farm and sphere pins
                // that have no row, so only pins with a preference row are patched.
                val pins = ctx.alerts.pinPreferences().map { it.pamsPin }
                if (pins.isNotEmpty()) {
                    ctx.alerts.updatePinPreferences(userId, pins, alertTax = homeChanges, alertAssessment = homeChanges, alertScore = homeChanges, alertDeadline = deadlines, now = now)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The rows did not change, so the two category switches stay where they were (the display follows the
                // rows when they exist); the rest of this update is kept, and the screen shows the error.
                commit(preferences.copy(channels = preferences.channels + (AlertChannel.ClientHomeChanges to homeChangesBefore) + (AlertChannel.AppealDeadlines to deadlinesBefore)), before)
                throw e
            }
        }
        commit(preferences, before)
    }

    /** Keeps the device-held switches, publishes the state and mirrors it to the push registration (best effort). */
    private suspend fun commit(preferences: AlertPreferences, before: AlertPreferences) {
        ctx.store.writeJson(LiveKeys.LOCAL_ALERTS, StoredLocalAlerts(
            mondayNotification = preferences.mondayNotification,
            channels = preferences.channels.entries.associate { (c, on) -> c.id to on },
            quietStartHour = preferences.quietHours.startHour,
            quietEndHour = preferences.quietHours.endHour,
        ))
        val published = preferences.copy(deliveryLabel = before.deliveryLabel, timeZone = before.timeZone)
        state.value = published
        mirrorToPush(published)
    }

    private suspend fun mirrorToPush(preferences: AlertPreferences) {
        val stored = ctx.store.readJson<StoredPushRegistration>(LiveKeys.PUSH) ?: return
        if (stored.token == null) return
        bestEffort { ctx.alerts.updateRegistration(registration(stored, preferences, stored.platform ?: "android")) }
    }

    /** The switches as this device holds them, whether or not [refresh] has run yet in this process. */
    private suspend fun storedPreferences(): AlertPreferences {
        val local = ctx.store.readJson<StoredLocalAlerts>(LiveKeys.LOCAL_ALERTS) ?: return state.value
        return state.value.copy(mondayNotification = local.mondayNotification, channels = local.channelMap(), quietHours = local.quietHours())
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

    /**
     * `register` on first contact, `heartbeat` afterwards (every launch, and when FCM rotates the token). A heartbeat
     * names only the installation, token and platform: the function patches just the fields a body carries, so the
     * flags, quiet hours and timezone the agent last saved stay as they are. The first registration seeds the row
     * from the switches stored on this device, not from the in-memory defaults that precede [refresh].
     */
    override suspend fun registerPushToken(token: String, platform: String) {
        if (token.isBlank()) throw WatchdogException("Empty push token")
        val stored = ctx.store.readJson<StoredPushRegistration>(LiveKeys.PUSH) ?: StoredPushRegistration(UUID.randomUUID().toString().replace("-", ""))
        val heartbeat = stored.token != null
        val next = stored.copy(token = token, platform = platform)
        try {
            if (heartbeat) ctx.alerts.heartbeat(next.installationId, token, platform)
            else ctx.alerts.register(registration(next, storedPreferences(), platform), heartbeat = false)
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
        if (stored.token != null) bestEffort { ctx.alerts.unregister(stored.installationId) }
        ctx.store.writeJson(LiveKeys.PUSH, stored.copy(token = null, registeredAtEpochSeconds = null))
    }

    /** The in-app list: the agent's own `property_update_events`, newest first, routine refreshes hidden. */
    override suspend fun recent(): List<AppNotification> {
        val now = ctx.now()
        val since = Instant.fromEpochSeconds(now.epochSeconds - 30 * 86_400L)
        val events = ctx.digest.events(since, limit = 100).filter { it.eventType in DigestApi.WEIGHTS }
        val sphere = bestEffort { ctx.digest.sphere() }
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
