package com.watchdogindex.agent.push

import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind
import com.watchdogindex.agent.navigation.IntentRoutes
import com.watchdogindex.agent.ui.nav.Route
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * The contract between the app and `supabase/functions/push-sender/index.ts`. [serverMessage] reproduces the data
 * map `fcmMessage()` builds for an outbox row sent to an Android device (index.ts `channelFor`, `actionsFor`,
 * `routeFor` and `fcmMessage`), [legacyServerMessage] what the function sent before the contract was aligned, and
 * every test decodes them the way the phone does: through [PushPayload], [NotificationActions] and [IntentRoutes].
 */
class PushPayloadTest {
    private val pin = "0409_285.14_9"
    private val appName = "Watchdog"
    private val title = "Tax bill posted"
    private val body = "36 Birchwood Dr: 2026 bill is \$11,240, up \$310."

    /** One FCM message as push-sender sends it; [notificationTitle] and [notificationBody] exist only in the legacy shape. */
    private class ServerMessage(val data: Map<String, String>, val notificationTitle: String? = null, val notificationBody: String? = null)

    /** The current shape: data only, the text inside the data map, the app's channel ids, action and route words. */
    private fun serverMessage(
        kind: String,
        severity: String = "info",
        eventType: String? = "tax_change",
        pamsPin: String? = pin,
        route: String? = null,
        eventId: String? = "48213",
    ): ServerMessage {
        // channelFor(kind, eventType), actionsFor(kind, eventType) and routeFor(kind, requested) in index.ts.
        val channel = when {
            kind == "digest" -> "monday_brief"
            eventType == "deed_change" -> "farm_sales_deeds"
            eventType == "municipal_change" -> "town_rates_revaluations"
            eventType == "appeal_deadline" -> "appeal_deadlines"
            else -> "client_home_changes"
        }
        val actions = when {
            kind == "digest" -> "open_brief"
            kind == "test" -> "open"
            eventType == "deed_change" -> "view_farm,later"
            else -> "open,later"
        }
        val resolvedRoute = when (kind) {
            "digest" -> route?.takeIf { it != "pulse" } ?: "brief"
            "test" -> route ?: "alerts"
            else -> route ?: "pulse"
        }
        return ServerMessage(dataMap(kind, severity, eventType, pamsPin, resolvedRoute, eventId, channel, actions, textInData = true))
    }

    /** The shape before alignment: a `notification` block, the server's own channel names and action words, route "pulse". */
    private fun legacyServerMessage(
        kind: String,
        severity: String = "info",
        eventType: String? = "tax_change",
        pamsPin: String? = pin,
        route: String? = null,
        eventId: String? = "48213",
    ): ServerMessage {
        val channel = when {
            kind == "digest" -> "digest"
            kind == "test" -> "system"
            severity == "action" -> "property_alerts_action"
            else -> "property_alerts"
        }
        val actions = when (kind) {
            "digest" -> "open_desk"
            "test" -> "open_app"
            else -> "open_property,mark_read"
        }
        return ServerMessage(
            dataMap(kind, severity, eventType, pamsPin, route ?: "pulse", eventId, channel, actions, textInData = false),
            notificationTitle = title,
            notificationBody = body,
        )
    }

    private fun dataMap(
        kind: String,
        severity: String,
        eventType: String?,
        pamsPin: String?,
        route: String,
        eventId: String?,
        channel: String,
        actions: String,
        textInData: Boolean,
    ): Map<String, String> {
        val data = linkedMapOf<String, String>()
        if (textInData) {
            data["title"] = title
            data["body"] = body
        }
        data["kind"] = kind
        data["route"] = route
        data["pin"] = pamsPin.orEmpty()
        data["event_id"] = eventId.orEmpty()
        data["event_type"] = eventType.orEmpty()
        data["severity"] = severity
        data["channel"] = channel
        data["actions"] = actions
        data["collapse_key"] = "property:${pamsPin ?: "system"}"
        data["outbox_id"] = "77"
        return data.filterValues { it.isNotEmpty() } // `for (const k of Object.keys(data)) if (!data[k]) delete data[k];`
    }

    private fun decode(message: ServerMessage): PushPayload = assertNotNullAnd(
        PushPayload.parse(
            data = message.data,
            defaultTitle = appName,
            notificationTitle = message.notificationTitle,
            notificationBody = message.notificationBody,
            messageId = "0:1700000000%abcdef",
        ),
    )

    private fun <T> assertNotNullAnd(value: T?): T {
        assertNotNull(value)
        return value!!
    }

    @Test
    fun `a property event posts on the client home changes channel with the property behind it`() {
        val payload = decode(serverMessage(kind = "property_event"))
        assertEquals(title, payload.title)
        assertEquals(body, payload.body)
        assertEquals(AlertChannel.ClientHomeChanges, payload.channel)
        assertEquals(pin, payload.pin)
        assertEquals("pulse", payload.route)
        assertNull(payload.phone)
        assertEquals(
            listOf(NotificationAction(NotificationActionKind.Open, "Open"), NotificationAction(NotificationActionKind.Later, "Later")),
            payload.actions,
        )
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(payload.pin, payload.route))
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(payload.pin, NotificationActions.routeFor(NotificationActionKind.Open, payload.pin, payload.route)))
    }

    @Test
    fun `the event type picks the channel and a deed in the farm offers the farm`() {
        val deed = decode(serverMessage("property_event", severity = "action", eventType = "deed_change"))
        assertEquals(AlertChannel.FarmSalesAndDeeds, deed.channel)
        assertEquals(listOf(NotificationActionKind.ViewFarm, NotificationActionKind.Later), deed.actions.map { it.kind })
        assertEquals(Route.Farm, IntentRoutes.fromExtras(deed.pin, NotificationActions.routeFor(NotificationActionKind.ViewFarm, deed.pin, deed.route)))
        // The content tap still opens the home the deed is about.
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(deed.pin, deed.route))
        assertEquals(AlertChannel.TownRatesAndRevaluations, decode(serverMessage("property_event", eventType = "municipal_change")).channel)
        assertEquals(AlertChannel.AppealDeadlines, decode(serverMessage("property_event", severity = "action", eventType = "appeal_deadline")).channel)
        assertEquals(AlertChannel.ClientHomeChanges, decode(serverMessage("property_event", eventType = "assessment_change")).channel)
        assertEquals(AlertChannel.ClientHomeChanges, decode(serverMessage("property_event", eventType = "permit_change")).channel)
    }

    @Test
    fun `a digest is the Monday brief on the Intelligence screen and a test push lands on the default channel`() {
        val digest = decode(serverMessage(kind = "digest", eventType = null, pamsPin = null))
        assertEquals(AlertChannel.MondayBrief, digest.channel)
        assertNull(digest.pin)
        assertEquals("brief", digest.route)
        assertEquals(listOf(NotificationAction(NotificationActionKind.OpenBrief, "Open brief")), digest.actions)
        // The content tap and the "Open brief" button land in the same place.
        assertEquals(Route.Intelligence, IntentRoutes.fromExtras(digest.pin, digest.route))
        assertEquals(Route.Intelligence, IntentRoutes.fromExtras(null, NotificationActions.routeFor(NotificationActionKind.OpenBrief, null, digest.route)))
        // A digest row that names another app route word is honoured; "pulse" is not one for a digest.
        assertEquals(Route.Today, IntentRoutes.fromExtras(null, decode(serverMessage("digest", eventType = null, pamsPin = null, route = "today")).route))
        assertEquals("brief", decode(serverMessage("digest", eventType = null, pamsPin = null, route = "pulse")).route)

        val test = decode(serverMessage(kind = "test", eventType = "system", pamsPin = null))
        assertEquals(PushPayload.DEFAULT_CHANNEL, test.channel)
        assertEquals("alerts", test.route)
        assertEquals(listOf(NotificationAction(NotificationActionKind.Open, "Open")), test.actions)
        assertEquals(Route.Alerts, IntentRoutes.fromExtras(test.pin, test.route))
    }

    @Test
    fun `the shape push-sender sent before the contract was aligned still decodes`() {
        val event = decode(legacyServerMessage(kind = "property_event"))
        assertEquals(title, event.title)
        assertEquals(body, event.body)
        assertEquals(AlertChannel.ClientHomeChanges, event.channel)
        assertEquals(pin, event.pin)
        assertEquals("pulse", event.route)
        // open_property opens the home, mark_read clears the alert on the device.
        assertEquals(listOf(NotificationActionKind.Open, NotificationActionKind.Later), event.actions.map { it.kind })
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(event.pin, event.route))
        // Its channel names are not device channels: the event type decides.
        assertEquals(AlertChannel.FarmSalesAndDeeds, decode(legacyServerMessage("property_event", severity = "action", eventType = "deed_change")).channel)
        assertEquals(AlertChannel.TownRatesAndRevaluations, decode(legacyServerMessage("property_event", eventType = "municipal_change")).channel)
        assertEquals(AlertChannel.AppealDeadlines, decode(legacyServerMessage("property_event", severity = "action", eventType = "appeal_deadline")).channel)

        val digest = decode(legacyServerMessage(kind = "digest", eventType = null, pamsPin = null))
        assertEquals(AlertChannel.MondayBrief, digest.channel)
        assertEquals(listOf(NotificationActionKind.Open), digest.actions.map { it.kind })
        // Its default route "pulse" without a pin is the alerts list; "agent-desk" is Today.
        assertEquals(Route.Alerts, IntentRoutes.fromExtras(digest.pin, digest.route))
        assertEquals(Route.Today, IntentRoutes.fromExtras(null, decode(legacyServerMessage("digest", eventType = null, pamsPin = null, route = "agent-desk")).route))

        val test = decode(legacyServerMessage(kind = "test", eventType = "system", pamsPin = null))
        assertEquals(PushPayload.DEFAULT_CHANNEL, test.channel)
        assertEquals(listOf(NotificationActionKind.Open), test.actions.map { it.kind })
        assertEquals("alerts", NotificationActions.routeFor(NotificationActionKind.Open, null, null))
    }

    @Test
    fun `a system rendered notification's tap carries the same keys as intent extras`() {
        // Only the legacy shape has a notification block the system renders in the background.
        val message = legacyServerMessage(kind = "property_event")
        // MainActivity falls back to the bare keys when the namespaced extras are absent.
        val route = IntentRoutes.parse(
            action = "android.intent.action.MAIN",
            dataString = null,
            sharedText = null,
            extraPin = PushPayload.pinOf(message.data[PushPayload.KEY_PIN], message.data[PushPayload.KEY_PAMS_PIN]),
            extraRoute = message.data[PushPayload.KEY_ROUTE],
        )
        assertEquals(Route.Property(pin), route)
        assertEquals(pin, PushPayload.pinOf(null, " $pin "))
        assertEquals(pin, PushPayload.pinOf("not-a-pin", pin))
        assertNull(PushPayload.pinOf("not-a-pin", null))
    }

    @Test
    fun `the notification id follows the event so a resend updates instead of duplicating`() {
        val first = decode(serverMessage(kind = "property_event", eventId = "48213"))
        val again = decode(serverMessage(kind = "property_event", eventId = "48213"))
        val other = decode(serverMessage(kind = "property_event", eventId = "48214"))
        assertEquals(first.notificationId, again.notificationId)
        assertTrue(first.notificationId != other.notificationId)
        assertTrue(first.notificationId >= 0)
        // No event id: the FCM message id, then the collapse key, then the text.
        val noEvent = serverMessage(kind = "test", eventType = "system", pamsPin = null, eventId = null)
        val byMessageId = PushPayload.parse(noEvent.data, appName, messageId = "m-1")!!
        val byCollapse = PushPayload.parse(noEvent.data, appName, messageId = null)!!
        assertEquals("m-1".hashCode() and 0x7FFFFFFF, byMessageId.notificationId)
        assertEquals("property:system".hashCode() and 0x7FFFFFFF, byCollapse.notificationId)
    }

    @Test
    fun `the app's own data-only contract still decodes`() {
        val data = mapOf(
            "title" to "Deed recorded in your farm",
            "body" to "12 Elm St sold. Neighborhood turnover, not a seller prediction.",
            "channel" to "farm_sales_deeds",
            "actions" to "view_farm,later",
            "pams_pin" to pin,
            "route" to "property",
            "phone" to "+1 732 555 0100",
            "event_id" to "evt-9",
        )
        val payload = PushPayload.parse(data, defaultTitle = appName)!!
        assertEquals("Deed recorded in your farm", payload.title)
        assertEquals(AlertChannel.FarmSalesAndDeeds, payload.channel)
        assertEquals(pin, payload.pin)
        assertEquals("property", payload.route)
        assertEquals("+1 732 555 0100", payload.phone)
        assertEquals(listOf(NotificationActionKind.ViewFarm, NotificationActionKind.Later), payload.actions.map { it.kind })
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(payload.pin, payload.route))
        // A channel may also arrive as the enum name; anything else falls back to the default without an event type.
        assertEquals(AlertChannel.MondayBrief, PushPayload.channelFor("MondayBrief", null))
        assertEquals(AlertChannel.AppealDeadlines, PushPayload.channelFor(" appeal_deadlines ", "deed_change"))
        assertEquals(PushPayload.DEFAULT_CHANNEL, PushPayload.channelFor("news", null))
        assertEquals(PushPayload.DEFAULT_CHANNEL, PushPayload.channelFor(null, null))
    }

    @Test
    fun `a message without any text shows nothing`() {
        assertNull(PushPayload.parse(mapOf("channel" to "monday_brief", "route" to "brief"), defaultTitle = appName))
        assertNull(PushPayload.parse(mapOf("title" to "Watchdog", "body" to "  "), defaultTitle = appName))
        val summaryOnly = PushPayload.parse(mapOf("summary" to "Assessment changed"), defaultTitle = appName)!!
        assertEquals(appName, summaryOnly.title)
        assertEquals("Assessment changed", summaryOnly.body)
    }

    /**
     * The words [serverMessage] hardcodes are the ones push-sender's source emits, and the Android message is data
     * only. Skipped when the repository root is not reachable from the test's working directory (the Android module
     * runs tests from `app/`).
     */
    @Test
    fun `the hardcoded server words match push-sender's source`() {
        val source = pushSenderSource()
        assumeTrue("supabase/functions/push-sender/index.ts not found from ${File(".").absolutePath}", source != null)
        val expected = listOf(
            "\"client_home_changes\"", "\"farm_sales_deeds\"", "\"town_rates_revaluations\"", "\"appeal_deadlines\"", "\"monday_brief\"",
            "if (eventType === \"deed_change\") return CHANNEL_IDS.farmSalesDeeds;",
            "if (eventType === \"municipal_change\") return CHANNEL_IDS.townRatesRevaluations;",
            "if (eventType === \"appeal_deadline\") return CHANNEL_IDS.appealDeadlines;",
            "return \"open_brief\"", "return \"open\"", "return \"view_farm,later\"", "return \"open,later\"",
            "requested !== \"pulse\" ? requested : \"brief\"", "requested || \"alerts\"", "requested || \"pulse\"",
            "title,", "body,", "pin:", "event_id:", "event_type:", "channel:", "actions:", "collapse_key:",
            "android: { priority: \"HIGH\", collapse_key: collapse }",
        )
        for (word in expected) assertTrue("push-sender/index.ts no longer contains $word; update PushPayload and this test together", source!!.contains(word))
        val fcm = source!!.substringAfter("function fcmMessage(").substringBefore("// --- FCM error classification ---")
        val androidPart = fcm.substringBefore("if (row.platform === \"ios\")")
        assertFalse("the Android message must stay data-only (no notification block)", androidPart.contains("notification: {"))
    }

    private fun pushSenderSource(): String? {
        var dir: File? = File(System.getProperty("user.dir").orEmpty()).absoluteFile
        repeat(6) {
            val candidate = File(dir, "supabase/functions/push-sender/index.ts")
            if (candidate.isFile) return candidate.readText()
            dir = dir?.parentFile ?: return null
        }
        return null
    }
}
