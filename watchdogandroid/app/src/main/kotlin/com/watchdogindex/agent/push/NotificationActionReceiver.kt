package com.watchdogindex.agent.push

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Handles the "Later" action: clears that one alert without opening the app. Declared non-exported in the
 * manifest. It never starts an activity: a receiver reached from a notification action is a trampoline on
 * Android 12+, so actions that open a screen or the dialer are activity intents to MainActivity instead.
 */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DISMISS) return
        val id = intent.getIntExtra(WatchdogMessagingService.EXTRA_NOTIFICATION_ID, -1)
        if (id >= 0) WatchdogMessagingService.cancelAlert(context, id)
    }

    companion object {
        const val ACTION_DISMISS = "com.watchdogindex.agent.action.DISMISS_NOTIFICATION"

        fun dismissIntent(context: Context, notificationId: Int, requestSalt: Int): PendingIntent {
            val intent = Intent(context, NotificationActionReceiver::class.java).apply {
                action = ACTION_DISMISS
                putExtra(WatchdogMessagingService.EXTRA_NOTIFICATION_ID, notificationId)
            }
            return PendingIntent.getBroadcast(
                context,
                notificationId * 8 + requestSalt,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
    }
}
