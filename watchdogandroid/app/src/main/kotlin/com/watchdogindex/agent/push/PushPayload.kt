package com.watchdogindex.agent.push

import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.repo.live.LiveAlertsRepository
import com.watchdogindex.agent.navigation.IntentRoutes

/**
 * What a push message asks the app to show, decoded from its data map. Pure Kotlin (no android.*), so the wire
 * contract is unit-tested on the JVM: PushPayloadTest decodes exactly what the server's sender emits.
 *
 * Two shapes are accepted:
 *  - The app's own contract (Docs push proposal, section 8), a data-only message: `title`, `body`, `channel` (an
 *    [AlertChannel] id), `actions` (open_brief, call_client, view_farm, send_checkups, later, open), `pin` or
 *    `pams_pin`, `route` (a word IntentRoutes.fromExtras understands), `phone`, `event_id`.
 *  - What `supabase/functions/push-sender/index.ts` (`fcmMessage`) sends today: the text in a `notification` block
 *    and a data map of `route` ("pulse"), `pin`, `event_id`, `event_type`, `severity`, `channel` (its own names:
 *    property_alerts, property_alerts_action, digest, system), `actions` (open_property,mark_read / open_desk /
 *    open_app), `collapse_key` and `kind`. Its channel names are not device channels, so the channel comes from
 *    `event_type` through the mapping the in-app Alerts list already uses ([LiveAlertsRepository.channelFor]), and
 *    its action words map onto the app's kinds in [NotificationActions.kindOf].
 *
 * A message with a `notification` block that arrives while the app is in the background is rendered by the system
 * and never reaches WatchdogMessagingService; its tap delivers the data map as launcher-intent extras, which
 * MainActivity reads under [KEY_ROUTE], [KEY_PIN] and [KEY_PAMS_PIN].
 */
data class PushPayload(
    val title: String,
    val body: String,
    val channel: AlertChannel,
    val pin: String?,
    val route: String?,
    val phone: String?,
    val actions: List<NotificationAction>,
    /** From `event_id`, else the FCM message id, else the collapse key: a resend of one event updates its notification instead of adding another. */
    val notificationId: Int,
) {
    companion object {
        const val KEY_TITLE = "title"
        const val KEY_BODY = "body"
        const val KEY_SUMMARY = "summary"
        const val KEY_CHANNEL = "channel"
        const val KEY_EVENT_TYPE = "event_type"
        const val KEY_ACTIONS = "actions"
        const val KEY_PIN = "pin"
        const val KEY_PAMS_PIN = "pams_pin"
        const val KEY_ROUTE = "route"
        const val KEY_PHONE = "phone"
        const val KEY_EVENT_ID = "event_id"
        const val KEY_COLLAPSE_KEY = "collapse_key"

        /** Unknown or missing channels post as client home changes, which is also the manifest's default channel. */
        val DEFAULT_CHANNEL: AlertChannel = AlertChannel.ClientHomeChanges

        /** push-sender's `channel` for a digest row (`channelFor` in index.ts); on the device that is the Monday brief. */
        const val SERVER_CHANNEL_DIGEST = "digest"

        /**
         * Decodes one message. [notificationTitle] and [notificationBody] are the `notification` block when the
         * message has one (they win over the data fields). Null when there is no text to show.
         */
        fun parse(
            data: Map<String, String>,
            defaultTitle: String,
            notificationTitle: String? = null,
            notificationBody: String? = null,
            messageId: String? = null,
        ): PushPayload? {
            val title = firstText(notificationTitle, data[KEY_TITLE]) ?: defaultTitle
            val body = firstText(notificationBody, data[KEY_BODY], data[KEY_SUMMARY]) ?: return null
            val idSeed = firstText(data[KEY_EVENT_ID], messageId, data[KEY_COLLAPSE_KEY]) ?: "$title|$body"
            return PushPayload(
                title = title,
                body = body,
                channel = channelFor(data[KEY_CHANNEL], data[KEY_EVENT_TYPE]),
                pin = pinOf(data[KEY_PIN], data[KEY_PAMS_PIN]),
                route = firstText(data[KEY_ROUTE]),
                phone = firstText(data[KEY_PHONE]),
                actions = NotificationActions.parse(data[KEY_ACTIONS]),
                notificationId = idSeed.hashCode() and 0x7FFFFFFF,
            )
        }

        /** The first of [pin] then [pamsPin] that is a PAMS PIN; one rule for a data map and for intent extras. */
        fun pinOf(pin: String?, pamsPin: String?): String? =
            listOfNotNull(pin, pamsPin).map { it.trim() }.firstOrNull { IntentRoutes.isPin(it) }

        /**
         * The device channel for a payload: an [AlertChannel] id or name as sent; push-sender's `digest`; otherwise
         * the event type decides (deed_change is farm sales and deeds, municipal_change town rates and
         * revaluations, appeal_deadline appeal deadlines, everything else client home changes), so the per-channel
         * switches in Settings apply to server-named channels too.
         */
        fun channelFor(channel: String?, eventType: String?): AlertChannel {
            val key = channel?.trim()?.lowercase()
            AlertChannel.entries.firstOrNull { it.id == key || it.name.equals(key, ignoreCase = true) }?.let { return it }
            if (key == SERVER_CHANNEL_DIGEST) return AlertChannel.MondayBrief
            val type = firstText(eventType)?.lowercase() ?: return DEFAULT_CHANNEL
            return LiveAlertsRepository.channelFor(type)
        }

        private fun firstText(vararg values: String?): String? =
            values.firstNotNullOfOrNull { value -> value?.trim()?.takeIf { it.isNotEmpty() } }
    }
}
