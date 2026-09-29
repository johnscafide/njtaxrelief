package com.watchdogindex.agent.push

import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind

/**
 * Maps the `actions` field of a push payload (comma-separated kinds) to notification buttons, and each button
 * to the screen it opens. Pure Kotlin; unit-tested on the JVM.
 *
 * Kinds and labels (the labels are the exact strings in the approved notification mockup):
 * open_brief "Open brief", call_client "Call client", view_farm "View farm", send_checkups "Send checkups",
 * later "Later", open "Open". Android shows at most three actions, so the list is capped at three.
 */
object NotificationActions {
    const val MAX_ACTIONS = 3

    private val labels: Map<NotificationActionKind, String> = mapOf(
        NotificationActionKind.OpenBrief to "Open brief",
        NotificationActionKind.CallClient to "Call client",
        NotificationActionKind.ViewFarm to "View farm",
        NotificationActionKind.SendCheckups to "Send checkups",
        NotificationActionKind.Later to "Later",
        NotificationActionKind.Open to "Open",
    )

    /** "open_brief" -> OpenBrief; also accepts "openBrief", "OPEN_BRIEF", "open-brief". */
    fun kindOf(raw: String?): NotificationActionKind? {
        val key = raw?.trim()?.lowercase()?.replace("-", "_")?.replace(" ", "_") ?: return null
        return when (key) {
            "open_brief", "openbrief", "brief" -> NotificationActionKind.OpenBrief
            "call_client", "callclient", "call" -> NotificationActionKind.CallClient
            "view_farm", "viewfarm", "farm" -> NotificationActionKind.ViewFarm
            "send_checkups", "sendcheckups", "send_checkup", "checkups" -> NotificationActionKind.SendCheckups
            "later", "snooze", "dismiss" -> NotificationActionKind.Later
            "open" -> NotificationActionKind.Open
            else -> null
        }
    }

    /** The wire name for a kind, used in the action intents so the receiver can map it back. */
    fun wireName(kind: NotificationActionKind): String = when (kind) {
        NotificationActionKind.OpenBrief -> "open_brief"
        NotificationActionKind.CallClient -> "call_client"
        NotificationActionKind.ViewFarm -> "view_farm"
        NotificationActionKind.SendCheckups -> "send_checkups"
        NotificationActionKind.Later -> "later"
        NotificationActionKind.Open -> "open"
    }

    fun label(kind: NotificationActionKind): String = labels.getValue(kind)

    /** Parses "open_brief,call_client" into ordered, de-duplicated actions (unknown kinds dropped, max three). */
    fun parse(raw: String?): List<NotificationAction> {
        if (raw.isNullOrBlank()) return emptyList()
        val seen = LinkedHashSet<NotificationActionKind>()
        for (part in raw.split(',', ';', '|')) kindOf(part)?.let { seen.add(it) }
        return seen.take(MAX_ACTIONS).map { NotificationAction(it, label(it)) }
    }

    /**
     * The route word an action opens (see IntentRoutes.fromExtras). Null means the action does not open the app
     * (Later dismisses the notification). Call client opens the property when a PIN is known so the agent can dial
     * from the client's home; the payload's `phone` field, when present, is dialled directly by the service instead.
     */
    fun routeFor(kind: NotificationActionKind, pin: String?, defaultRoute: String?): String? = when (kind) {
        NotificationActionKind.OpenBrief -> "intelligence"
        NotificationActionKind.ViewFarm -> "farm"
        NotificationActionKind.SendCheckups -> "clients"
        NotificationActionKind.CallClient -> if (pin != null) "property" else (defaultRoute ?: "clients")
        NotificationActionKind.Later -> null
        NotificationActionKind.Open -> defaultRoute ?: if (pin != null) "property" else "alerts"
    }
}
