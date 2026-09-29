package com.watchdogindex.agent.push

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.watchdogindex.agent.MainActivity
import com.watchdogindex.agent.R
import com.watchdogindex.agent.WatchdogApplication
import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind
import com.watchdogindex.agent.navigation.IntentRoutes
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Receives FCM messages and token rotations. Only runs when Firebase is configured (google-services.json present);
 * without it the service is declared but Firebase never starts it.
 *
 * Payload contract (all data fields are strings; see Docs push proposal, section 8):
 *  title, body            the notification text (also accepted from the `notification` block)
 *  channel                an AlertChannel id, default client_home_changes
 *  actions                comma-separated kinds: open_brief, call_client, view_farm, send_checkups, later, open
 *  pin / pams_pin         the home the alert is about (opens the property)
 *  route                  the screen to open (see IntentRoutes.fromExtras)
 *  phone                  optional; makes "Call client" dial directly
 *  event_id / collapse_key stable ids used for the notification id
 * Push bodies come from privacy-reviewed sources; this service shows them as-is and never adds owner data.
 */
class WatchdogMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        val graph = (application as? WatchdogApplication)?.graph ?: return
        scope.launch { graph.push.registerToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = message.notification?.title ?: data["title"] ?: getString(R.string.app_name)
        val body = message.notification?.body ?: data["body"] ?: data["summary"] ?: return
        val channelId = NotificationChannels.idFor(data["channel"])
        val pin = (data["pin"] ?: data["pams_pin"])?.takeIf { IntentRoutes.isPin(it) }
        val route = data["route"]
        val actions = NotificationActions.parse(data["actions"])
        val idSeed = data["event_id"] ?: message.messageId ?: message.collapseKey ?: "$title|$body"
        val notificationId = idSeed.hashCode() and 0x7FFFFFFF
        showNotification(
            context = this,
            notificationId = notificationId,
            channelId = channelId,
            title = title,
            body = body,
            pin = pin,
            route = route,
            phone = data["phone"],
            actions = actions,
        )
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "WatchdogPush"
        const val EXTRA_NOTIFICATION_ID = "com.watchdogindex.agent.extra.NOTIFICATION_ID"

        /** Posts one grouped alert plus the group summary. Public so a local reminder could reuse it. */
        fun showNotification(
            context: Context,
            notificationId: Int,
            channelId: String,
            title: String,
            body: String,
            pin: String?,
            route: String?,
            phone: String?,
            actions: List<NotificationAction>,
        ) {
            NotificationChannels.ensure(context)
            val manager = NotificationManagerCompat.from(context)
            if (!manager.areNotificationsEnabled()) return
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU
            ) return

            val accent = ContextCompat.getColor(context, R.color.mark_blue)
            val builder = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(accent)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(openIntent(context, notificationId, pin, route, requestSalt = 0))
                .setAutoCancel(true)
                .setShowWhen(true)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setGroup(NotificationChannels.GROUP_KEY)
                .setOnlyAlertOnce(true)

            actions.forEachIndexed { index, action ->
                val pending = actionIntent(context, notificationId, action.kind, pin, route, phone, requestSalt = index + 1)
                builder.addAction(NotificationCompat.Action.Builder(0, action.label, pending).build())
            }

            val summary = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(accent)
                .setContentTitle(context.getString(R.string.notification_summary_title))
                .setContentText(context.getString(R.string.notification_summary_text))
                .setStyle(NotificationCompat.InboxStyle().addLine(title).setSummaryText(context.getString(R.string.notification_summary_text)))
                .setContentIntent(openIntent(context, NotificationChannels.SUMMARY_ID, null, "alerts", requestSalt = 0))
                .setGroup(NotificationChannels.GROUP_KEY)
                .setGroupSummary(true)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)

            try {
                manager.notify(notificationId, builder.build())
                manager.notify(NotificationChannels.SUMMARY_ID, summary.build())
            } catch (e: SecurityException) {
                Log.w(TAG, "Notification permission missing", e)
            }
        }

        private fun openIntent(context: Context, notificationId: Int, pin: String?, route: String?, requestSalt: Int): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                pin?.let { putExtra(IntentRoutes.EXTRA_PIN, it) }
                route?.let { putExtra(IntentRoutes.EXTRA_ROUTE, it) }
                putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                // Distinct data makes each PendingIntent unique so extras from one alert never leak into another.
                data = Uri.parse("watchdog://notification/$notificationId/$requestSalt")
            }
            return PendingIntent.getActivity(
                context,
                notificationId * 8 + requestSalt,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun actionIntent(
            context: Context,
            notificationId: Int,
            kind: NotificationActionKind,
            pin: String?,
            route: String?,
            phone: String?,
            requestSalt: Int,
        ): PendingIntent {
            if (kind == NotificationActionKind.Later) {
                return NotificationActionReceiver.dismissIntent(context, notificationId, requestSalt)
            }
            if (kind == NotificationActionKind.CallClient && !phone.isNullOrBlank()) {
                val dial = Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phone.trim()))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                return PendingIntent.getActivity(context, notificationId * 8 + requestSalt, dial, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            }
            val target = NotificationActions.routeFor(kind, pin, route)
            return openIntent(context, notificationId, pin, target, requestSalt)
        }
    }
}
