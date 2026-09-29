package com.watchdogindex.agent.core.api

import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Alert settings and push registration (auth-and-account.md 11; gap-answers.md "Settings alert switches";
 * database-and-push.md 8.4):
 *
 * - `agent_digest_preferences` (`enabled, weekday, local_hour, timezone`): the Monday email. Read with the session
 *   (RLS: own row and Agent plan; a free account gets no rows), written with an upsert on `user_id`. A missing row
 *   means on, Monday, 8 AM, America/New_York, exactly as the sender assumes.
 * - `property_alert_preferences` per pin (`alert_tax, alert_assessment, alert_score, alert_deadline, paused`):
 *   the only per-property switches the producers read. "Client home changes" fans out to the first three and
 *   "Appeal deadlines" to the fourth, over the agent's saved pins, with the web's upsert shape.
 * - `push-device-register` (PROPOSED edge function, not deployed yet): `register | heartbeat | update | unregister`
 *   with `installation_id`, `token`, `platform`, quiet hours and the two enable flags. Errors use the
 *   `agent-contact-intelligence` vocabulary (`sign_in_required`, `token_required`, ...).
 *
 * There is no server field for per-channel switches, quiet hours or "also send it as a notification"; those are
 * kept on the device and mirrored to the push registration when one exists.
 */
class AlertsApi(private val rest: SupabaseRest, private val edge: EdgeFunctions) {

    @Serializable
    data class DigestPreference(
        val enabled: Boolean = true,
        val weekday: Int = 1,
        @SerialName("local_hour") val localHour: Int = 8,
        val timezone: String = "America/New_York",
        @SerialName("last_sent_at") val lastSentAt: String? = null,
    )

    @Serializable
    data class PinPreference(
        @SerialName("pams_pin") val pamsPin: String,
        @SerialName("alert_score") val alertScore: Boolean = true,
        @SerialName("alert_tax") val alertTax: Boolean = true,
        @SerialName("alert_assessment") val alertAssessment: Boolean = true,
        @SerialName("alert_deadline") val alertDeadline: Boolean = true,
        val paused: Boolean = false,
    )

    /** What a push registration sends. Never contains owner data; `token` is the FCM registration token. */
    data class PushRegistration(
        val installationId: String,
        val token: String?,
        val platform: String,
        val appVersion: String?,
        val timezone: String,
        val quietStartHour: Int?,
        val quietEndHour: Int?,
        val alertsEnabled: Boolean,
        val digestEnabled: Boolean,
    )

    /** Null when there is no row (free plan, or never saved): the defaults apply. */
    suspend fun digestPreference(): DigestPreference? {
        val row = rest.maybeSingle("agent_digest_preferences", "enabled,weekday,local_hour,timezone,last_sent_at", emptyList(), feature = "Monday email") ?: return null
        return runCatching { WatchdogHttp.json.decodeFromJsonElement(DigestPreference.serializer(), row) }.getOrNull()
    }

    suspend fun saveDigestPreference(userId: String, enabled: Boolean, weekday: Int?, localHour: Int?, timezone: String?, now: Instant) {
        val row = buildJsonObject {
            put("user_id", userId)
            put("enabled", enabled)
            if (weekday != null) put("weekday", weekday.coerceIn(0, 6))
            if (localHour != null) put("local_hour", localHour.coerceIn(0, 23))
            if (!timezone.isNullOrBlank()) put("timezone", timezone)
            put("updated_at", now.toString())
        }
        rest.upsert("agent_digest_preferences", JsonArray(listOf(row)), onConflict = "user_id", feature = "Monday email", returning = false)
    }

    suspend fun pinPreferences(): List<PinPreference> {
        val rows = rest.select("property_alert_preferences", "pams_pin,alert_score,alert_tax,alert_assessment,alert_deadline,paused", limit = 2000, feature = "alerts")
        return DigestApi.decode(rows, PinPreference.serializer())
    }

    /** The web's `pulse.js:233-237` upsert, in chunks of 100. `paused` is only written when a caller sets it. */
    suspend fun savePinPreferences(userId: String, pins: List<String>, alertTax: Boolean, alertAssessment: Boolean, alertScore: Boolean, alertDeadline: Boolean, paused: Boolean?, now: Instant) {
        val rows = pins.distinct().map { pin ->
            buildJsonObject {
                put("user_id", userId)
                put("pams_pin", pin)
                put("alert_tax", alertTax)
                put("alert_assessment", alertAssessment)
                put("alert_score", alertScore)
                put("alert_deadline", alertDeadline)
                if (paused != null) put("paused", paused)
                put("updated_at", now.toString())
            }
        }
        for (chunk in rows.chunked(100)) {
            rest.upsert("property_alert_preferences", JsonArray(chunk), onConflict = "user_id,pams_pin", feature = "alerts", returning = false)
        }
    }

    fun registrationBody(action: String, registration: PushRegistration): JsonObject = buildJsonObject {
        put("action", action)
        put("installation_id", registration.installationId)
        if (action != "unregister") {
            put("platform", registration.platform)
            if (registration.token != null) put("token", registration.token)
            if (registration.appVersion != null) put("app_version", registration.appVersion)
            put("timezone", registration.timezone)
            if (registration.quietStartHour != null) put("quiet_hours_start", registration.quietStartHour)
            if (registration.quietEndHour != null) put("quiet_hours_end", registration.quietEndHour)
            put("alerts_enabled", registration.alertsEnabled)
            put("digest_enabled", registration.digestEnabled)
        }
    }

    /** `register` on first contact, `heartbeat` afterwards (also when FCM rotates the token). Returns the token-free registration. */
    suspend fun register(registration: PushRegistration, heartbeat: Boolean): JsonObject =
        edge.post("push-device-register", registrationBody(if (heartbeat) "heartbeat" else "register", registration), feature = "notifications")

    suspend fun updateRegistration(registration: PushRegistration): JsonObject =
        edge.post("push-device-register", registrationBody("update", registration), feature = "notifications")

    /** Idempotent: `200 {ok:true}` even when no row exists. */
    suspend fun unregister(installationId: String) {
        edge.post("push-device-register", buildJsonObject { put("action", "unregister"); put("installation_id", installationId) }, feature = "notifications")
    }
}
