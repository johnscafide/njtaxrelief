package com.watchdogindex.agent.push

import com.watchdogindex.agent.core.model.AlertChannel
import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind
import com.watchdogindex.agent.navigation.IntentRoutes
import com.watchdogindex.agent.ui.nav.Route
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * The contract between the app and `supabase/functions/push-sender/index.ts`. [serverMessage] reproduces the
 * data map `fcmMessage()` builds for an outbox row (index.ts `channelFor`, `actionsFor` and `fcmMessage`), and
 * every test decodes it the way the phone does: through [PushPayload], [NotificationActions] and [IntentRoutes].
 */
class PushPayloadTest {
    private val pin = "0409_285.14_9"
    private val appName = "Watchdog"

    /** One FCM message as push-sender sends it: a `notification` block plus the string data map. */
    private class ServerMessage(val title: String, val body: String, val data: Map<String, String>)

    private fun serverMessage(
        kind: String,
        severity: String = "info",
        eventType: String? = "tax_change",
        pamsPin: String? = pin,
        route: String? = null,
        eventId: String? = "48213",
    ): ServerMessage {
        // channelFor(kind, severity) and actionsFor(kind) in index.ts.
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
        val collapse = "property:${pamsPin ?: "system"}"
        val data = linkedMapOf(
            "kind" to kind,
            "route" to (route ?: "pulse"),
            "pin" to pamsPin.orEmpty(),
            "event_id" to eventId.orEmpty(),
            "event_type" to eventType.orEmpty(),
            "severity" to severity,
            "channel" to channel,
            "actions" to actions,
            "collapse_key" to collapse,
            "outbox_id" to "77",
        ).filterValues { it.isNotEmpty() } // `for (const k of Object.keys(data)) if (!data[k]) delete data[k];`
        return ServerMessage(title = "Tax bill posted", body = "36 Birchwood Dr: 2026 bill is \$11,240, up \$310.", data = data)
    }

    private fun decode(message: ServerMessage): PushPayload = assertNotNullAnd(
        PushPayload.parse(
            data = message.data,
            defaultTitle = appName,
            notificationTitle = message.title,
            notificationBody = message.body,
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
        assertEquals("Tax bill posted", payload.title)
        assertEquals(AlertChannel.ClientHomeChanges, payload.channel)
        assertEquals(pin, payload.pin)
        assertEquals("pulse", payload.route)
        assertNull(payload.phone)
        // open_property opens the home, mark_read clears the alert on the device.
        assertEquals(
            listOf(NotificationAction(NotificationActionKind.Open, "Open"), NotificationAction(NotificationActionKind.Later, "Later")),
            payload.actions,
        )
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(payload.pin, payload.route))
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(payload.pin, NotificationActions.routeFor(NotificationActionKind.Open, payload.pin, payload.route)))
    }

    @Test
    fun `the event type picks the channel when the server sends its own channel names`() {
        assertEquals(AlertChannel.FarmSalesAndDeeds, decode(serverMessage("property_event", severity = "action", eventType = "deed_change")).channel)
        assertEquals(AlertChannel.TownRatesAndRevaluations, decode(serverMessage("property_event", eventType = "municipal_change")).channel)
        assertEquals(AlertChannel.AppealDeadlines, decode(serverMessage("property_event", severity = "action", eventType = "appeal_deadline")).channel)
        assertEquals(AlertChannel.ClientHomeChanges, decode(serverMessage("property_event", eventType = "assessment_change")).channel)
        assertEquals(AlertChannel.ClientHomeChanges, decode(serverMessage("property_event", eventType = "permit_change")).channel)
    }

    @Test
    fun `a digest is the Monday brief and a test push lands on the default channel`() {
        val digest = decode(serverMessage(kind = "digest", eventType = null, pamsPin = null))
        assertEquals(AlertChannel.MondayBrief, digest.channel)
        assertNull(digest.pin)
        assertEquals(listOf(NotificationAction(NotificationActionKind.Open, "Open")), digest.actions)
        // Without a pin the server's default route is the alerts list; a `route` word the server sends is honoured.
        assertEquals(Route.Alerts, IntentRoutes.fromExtras(digest.pin, digest.route))
        assertEquals(Route.Today, IntentRoutes.fromExtras(null, decode(serverMessage("digest", eventType = null, pamsPin = null, route = "agent-desk")).route))

        val test = decode(serverMessage(kind = "test", eventType = "system", pamsPin = null))
        assertEquals(PushPayload.DEFAULT_CHANNEL, test.channel)
        assertEquals(listOf(NotificationAction(NotificationActionKind.Open, "Open")), test.actions)
        assertEquals("alerts", NotificationActions.routeFor(NotificationActionKind.Open, null, null))
    }

    @Test
    fun `a system rendered notification's tap carries the same keys as intent extras`() {
        val message = serverMessage(kind = "property_event")
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
        val byMessageId = PushPayload.parse(noEvent.data, appName, noEvent.title, noEvent.body, messageId = "m-1")!!
        val byCollapse = PushPayload.parse(noEvent.data, appName, noEvent.title, noEvent.body, messageId = null)!!
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
        assertNull(PushPayload.parse(mapOf("channel" to "digest", "route" to "pulse"), defaultTitle = appName))
        assertNull(PushPayload.parse(mapOf("title" to "Watchdog", "body" to "  "), defaultTitle = appName))
        val summaryOnly = PushPayload.parse(mapOf("summary" to "Assessment changed"), defaultTitle = appName)!!
        assertEquals(appName, summaryOnly.title)
        assertEquals("Assessment changed", summaryOnly.body)
    }

    /**
     * The words [serverMessage] hardcodes are the ones push-sender's source emits. Skipped when the repository
     * root is not reachable from the test's working directory (the Android module runs tests from `app/`).
     */
    @Test
    fun `the hardcoded server words match push-sender's source`() {
        val source = pushSenderSource()
        assumeTrue("supabase/functions/push-sender/index.ts not found from ${File(".").absolutePath}", source != null)
        val expected = listOf(
            "\"property_alerts_action\"", "\"property_alerts\"", "\"digest\"", "\"system\"",
            "\"open_property,mark_read\"", "\"open_desk\"", "\"open_app\"",
            "|| \"pulse\"", "pin,", "event_id:", "event_type:", "channel:", "actions:", "collapse_key:",
        )
        for (word in expected) assertTrue("push-sender/index.ts no longer contains $word; update PushPayload and this test together", source!!.contains(word))
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
