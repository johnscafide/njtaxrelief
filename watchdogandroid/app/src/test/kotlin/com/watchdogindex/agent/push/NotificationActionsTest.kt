package com.watchdogindex.agent.push

import com.watchdogindex.agent.core.model.NotificationAction
import com.watchdogindex.agent.core.model.NotificationActionKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationActionsTest {
    @Test
    fun `parses the mockup's action sets with the exact labels`() {
        assertEquals(
            listOf(
                NotificationAction(NotificationActionKind.OpenBrief, "Open brief"),
                NotificationAction(NotificationActionKind.CallClient, "Call client"),
            ),
            NotificationActions.parse("open_brief,call_client"),
        )
        assertEquals(listOf(NotificationAction(NotificationActionKind.ViewFarm, "View farm")), NotificationActions.parse("view_farm"))
        assertEquals(
            listOf(
                NotificationAction(NotificationActionKind.SendCheckups, "Send checkups"),
                NotificationAction(NotificationActionKind.Later, "Later"),
            ),
            NotificationActions.parse("send_checkups, later"),
        )
    }

    @Test
    fun `unknown kinds are dropped and duplicates collapse`() {
        assertEquals(
            listOf(NotificationAction(NotificationActionKind.Open, "Open")),
            NotificationActions.parse("teleport,open,OPEN, open "),
        )
    }

    @Test
    fun `at most three actions`() {
        val actions = NotificationActions.parse("open_brief,call_client,view_farm,send_checkups,later")
        assertEquals(3, actions.size)
        assertEquals(NotificationActionKind.ViewFarm, actions.last().kind)
    }

    @Test
    fun `blank input gives no actions`() {
        assertTrue(NotificationActions.parse(null).isEmpty())
        assertTrue(NotificationActions.parse("  ").isEmpty())
        assertTrue(NotificationActions.parse(",,").isEmpty())
    }

    @Test
    fun `kind names are tolerant and round trip through the wire name`() {
        for (kind in NotificationActionKind.entries) {
            assertEquals(kind, NotificationActions.kindOf(NotificationActions.wireName(kind)))
        }
        assertEquals(NotificationActionKind.OpenBrief, NotificationActions.kindOf("Open-Brief"))
        assertEquals(NotificationActionKind.CallClient, NotificationActions.kindOf("callClient"))
        assertNull(NotificationActions.kindOf(null))
        assertNull(NotificationActions.kindOf("nope"))
    }

    @Test
    fun `each action opens the right screen`() {
        val pin = "0409_285.14_9"
        assertEquals("intelligence", NotificationActions.routeFor(NotificationActionKind.OpenBrief, pin, null))
        assertEquals("farm", NotificationActions.routeFor(NotificationActionKind.ViewFarm, null, null))
        assertEquals("clients", NotificationActions.routeFor(NotificationActionKind.SendCheckups, null, null))
        assertEquals("property", NotificationActions.routeFor(NotificationActionKind.CallClient, pin, null))
        assertEquals("clients", NotificationActions.routeFor(NotificationActionKind.CallClient, null, null))
        assertNull(NotificationActions.routeFor(NotificationActionKind.Later, pin, null))
        assertEquals("pulse", NotificationActions.routeFor(NotificationActionKind.Open, pin, "pulse"))
        assertEquals("property", NotificationActions.routeFor(NotificationActionKind.Open, pin, null))
        assertEquals("alerts", NotificationActions.routeFor(NotificationActionKind.Open, null, null))
    }
}
