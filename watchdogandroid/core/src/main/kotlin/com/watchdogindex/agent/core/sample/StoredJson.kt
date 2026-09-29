package com.watchdogindex.agent.core.sample

import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.AlertPreferences
import com.watchdogindex.agent.core.model.AppSettings
import com.watchdogindex.agent.core.model.AppThemeMode
import com.watchdogindex.agent.core.model.AuthSession
import com.watchdogindex.agent.core.model.QuietHours
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/*
 * JSON shapes the sample repositories persist through the KeyValueStore. The domain models are plain data
 * classes (not @Serializable), so these small mirrors keep serialization out of core/model. Unknown keys are
 * ignored on read so an older stored value never crashes a newer build.
 */

internal val storedJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    prettyPrint = false
}

internal object StoreKeys {
    const val ALERT_PREFERENCES = "watchdog.sample.alert_preferences"
    const val APP_SETTINGS = "watchdog.sample.app_settings"
    const val SESSION = "watchdog.sample.session"
}

@Serializable
internal data class StoredAlertPreferences(
    val mondayEmail: Boolean = true,
    val mondayNotification: Boolean = true,
    val deliveryLabel: String = "Mondays at 8:00 AM",
    val timeZone: String = "America/New_York",
    val channels: Map<String, Boolean> = emptyMap(),
    val quietStartHour: Int = 21,
    val quietEndHour: Int = 7,
) {
    fun toModel(): AlertPreferences {
        val defaults = AlertPreferences()
        val byId = AlertChannel.entries.associateBy { it.id }
        val merged = defaults.channels.toMutableMap()
        for ((id, on) in channels) byId[id]?.let { merged[it] = on }
        return AlertPreferences(
            mondayEmail = mondayEmail,
            mondayNotification = mondayNotification,
            deliveryLabel = deliveryLabel,
            timeZone = timeZone,
            channels = merged,
            quietHours = QuietHours(quietStartHour, quietEndHour),
        )
    }

    companion object {
        fun from(model: AlertPreferences) = StoredAlertPreferences(
            mondayEmail = model.mondayEmail,
            mondayNotification = model.mondayNotification,
            deliveryLabel = model.deliveryLabel,
            timeZone = model.timeZone,
            channels = model.channels.entries.associate { (channel, on) -> channel.id to on },
            quietStartHour = model.quietHours.startHour,
            quietEndHour = model.quietHours.endHour,
        )

        fun encode(model: AlertPreferences): String = storedJson.encodeToString(from(model))

        fun decode(text: String?): AlertPreferences? =
            text?.let { runCatching { storedJson.decodeFromString<StoredAlertPreferences>(it).toModel() }.getOrNull() }
    }
}

@Serializable
internal data class StoredAppSettings(
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
        fun from(model: AppSettings) = StoredAppSettings(model.themeMode.name, model.hasSeenWelcome, model.extensionKeyEnabled)

        fun encode(model: AppSettings): String = storedJson.encodeToString(from(model))

        fun decode(text: String?): AppSettings? =
            text?.let { runCatching { storedJson.decodeFromString<StoredAppSettings>(it).toModel() }.getOrNull() }
    }
}

@Serializable
internal data class StoredSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long,
    val userId: String,
    val email: String,
) {
    fun toModel() = AuthSession(accessToken, refreshToken, expiresAtEpochSeconds, userId, email)

    companion object {
        fun from(model: AuthSession) =
            StoredSession(model.accessToken, model.refreshToken, model.expiresAtEpochSeconds, model.userId, model.email)

        fun encode(model: AuthSession): String = storedJson.encodeToString(from(model))

        fun decode(text: String?): AuthSession? =
            text?.let { runCatching { storedJson.decodeFromString<StoredSession>(it).toModel() }.getOrNull() }
    }
}
