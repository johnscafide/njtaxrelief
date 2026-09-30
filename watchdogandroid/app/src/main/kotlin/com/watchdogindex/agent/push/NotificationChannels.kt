package com.watchdogindex.agent.push

import android.content.Context
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationChannelGroupCompat
import androidx.core.app.NotificationManagerCompat
import com.watchdogindex.agent.R
import com.watchdogindex.agent.core.model.AlertChannel

/**
 * Notification channels, one per [AlertChannel] so the system switches line up with the Alerts section in
 * Settings, in two groups: "Alerts" (the four property/farm/town/deadline channels) and "Monday brief".
 * Every description ends with [AlertChannel.NOT_A_SELLER_PREDICTION], as the privacy rules require.
 * Which channel a push payload posts on is decided by [PushPayload.channelFor].
 */
object NotificationChannels {
    const val GROUP_ALERTS = "alerts"
    const val GROUP_MONDAY_BRIEF = "monday_brief_group"

    /** One notification group key so alerts stack under a single Watchdog summary in the shade. */
    const val GROUP_KEY = "com.watchdogindex.agent.ALERTS"
    const val SUMMARY_ID = 1_000

    val DEFAULT_CHANNEL: AlertChannel = PushPayload.DEFAULT_CHANNEL

    /** Creates (or updates the names/descriptions of) every channel. Safe to call on every start. */
    fun ensure(context: Context) {
        val manager = NotificationManagerCompat.from(context)
        manager.createNotificationChannelGroupsCompat(
            listOf(
                NotificationChannelGroupCompat.Builder(GROUP_ALERTS).setName(context.getString(R.string.notification_group_alerts)).build(),
                NotificationChannelGroupCompat.Builder(GROUP_MONDAY_BRIEF).setName(context.getString(R.string.notification_group_monday_brief)).build(),
            ),
        )
        manager.createNotificationChannelsCompat(AlertChannel.entries.map { channel -> channel.toNotificationChannel() })
    }

    /** The channel a stored channel id names; unknown ids read as the default. */
    fun channelFor(id: String): AlertChannel = AlertChannel.entries.firstOrNull { it.id == id } ?: DEFAULT_CHANNEL

    private fun AlertChannel.toNotificationChannel(): NotificationChannelCompat {
        val importance = when (this) {
            AlertChannel.AppealDeadlines -> NotificationManagerCompat.IMPORTANCE_HIGH
            else -> NotificationManagerCompat.IMPORTANCE_DEFAULT
        }
        val group = if (this == AlertChannel.MondayBrief) GROUP_MONDAY_BRIEF else GROUP_ALERTS
        return NotificationChannelCompat.Builder(id, importance)
            .setName(title)
            .setDescription(description(this))
            .setGroup(group)
            .setShowBadge(true)
            .build()
    }

    /** "Tax bills, assessments and permits. Property changes are not seller predictions." */
    fun description(channel: AlertChannel): String = channel.fullDescription
}
