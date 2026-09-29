package com.watchdogindex.agent.navigation

import com.watchdogindex.agent.ui.nav.Route
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IntentRoutesTest {
    private val pin = "0409_285.14_9"

    @Test
    fun `property page link opens the property`() {
        val route = IntentRoutes.parse(
            action = IntentRoutes.ACTION_VIEW,
            dataString = "https://www.watchdogindex.com/nj/cherry-hill-twp/36-birchwood-dr/$pin",
            sharedText = null, extraPin = null, extraRoute = null,
        )
        assertEquals(Route.Property(pin), route)
    }

    @Test
    fun `property page link ignores query and fragment`() {
        val route = IntentRoutes.fromLink("https://www.watchdogindex.com/nj/cherry-hill-twp/36-birchwood-dr/$pin?utm_source=share#taxes")
        assertEquals(Route.Property(pin), route)
    }

    @Test
    fun `bare host is accepted too`() {
        assertEquals(Route.Property(pin), IntentRoutes.fromLink("https://watchdogindex.com/nj/cherry-hill-twp/36-birchwood-dr/$pin"))
    }

    @Test
    fun `true cost and checkup links use the pin query`() {
        assertEquals(Route.Property(pin), IntentRoutes.fromLink("https://www.watchdogindex.com/true-cost?pin=$pin"))
        assertEquals(Route.Property(pin), IntentRoutes.fromLink("https://www.watchdogindex.com/checkup?pin=$pin&agent=alex-moreno"))
    }

    @Test
    fun `scan link carries the listing url`() {
        val listing = "https://www.zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701/12345_zpid/"
        val encoded = RouteNames.encode(listing)
        assertEquals(Route.Scan(listing), IntentRoutes.fromLink("https://www.watchdogindex.com/scan?url=$encoded"))
        assertEquals(Route.Scan(null), IntentRoutes.fromLink("https://www.watchdogindex.com/scan"))
    }

    @Test
    fun `other hosts and non property pages are ignored`() {
        assertNull(IntentRoutes.fromLink("https://www.zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701/"))
        assertNull(IntentRoutes.fromLink("https://www.watchdogindex.com/nj/cherry-hill-twp"))
        assertNull(IntentRoutes.fromLink("https://www.watchdogindex.com/pro"))
        assertNull(IntentRoutes.fromLink("not a link"))
    }

    @Test
    fun `custom scheme routes`() {
        assertEquals(Route.Property(pin), IntentRoutes.fromLink("watchdog://property/$pin"))
        assertEquals(Route.Farm, IntentRoutes.fromLink("watchdog://farm"))
        assertEquals(Route.Intelligence, IntentRoutes.fromLink("watchdog://brief"))
        assertEquals(Route.Search("Red Bank"), IntentRoutes.fromLink("watchdog://search?q=Red%20Bank"))
        assertEquals(Route.Search("Red Bank"), IntentRoutes.fromLink("watchdog://search?q=Red+Bank"))
        assertEquals(Route.Scan("https://a.example/x?y=1&z=2"), IntentRoutes.fromLink("watchdog://scan?url=https%3A%2F%2Fa.example%2Fx%3Fy%3D1%26z%3D2"))
        assertNull(IntentRoutes.fromLink("watchdog://nowhere"))
    }

    @Test
    fun `shared text opens scan with the first link`() {
        val route = IntentRoutes.parse(
            action = IntentRoutes.ACTION_SEND, dataString = null,
            sharedText = "Look at this one https://www.zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701/12345_zpid/. Nice yard",
            extraPin = null, extraRoute = null,
        )
        assertEquals(Route.Scan("https://www.zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701/12345_zpid/"), route)
    }

    @Test
    fun `shared text without a link is passed through and empty text opens plain scan`() {
        assertEquals(Route.Scan("143 Harding Rd, Red Bank"), IntentRoutes.fromSharedText("  143 Harding Rd, Red Bank  "))
        assertEquals(Route.Scan(null), IntentRoutes.fromSharedText(""))
        assertEquals(Route.Scan(null), IntentRoutes.fromSharedText(null))
    }

    @Test
    fun `notification extras win over the data string`() {
        val route = IntentRoutes.parse(
            action = IntentRoutes.ACTION_VIEW, dataString = "https://www.watchdogindex.com/scan",
            sharedText = null, extraPin = pin, extraRoute = null,
        )
        assertEquals(Route.Property(pin), route)
    }

    @Test
    fun `notification route words`() {
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(pin, null))
        assertEquals(Route.Property(pin), IntentRoutes.fromExtras(pin, "pulse"))
        assertEquals(Route.Alerts, IntentRoutes.fromExtras(null, "pulse"))
        assertEquals(Route.Today, IntentRoutes.fromExtras(null, "agent-desk"))
        assertEquals(Route.Today, IntentRoutes.fromExtras(null, "digest"))
        assertEquals(Route.Intelligence, IntentRoutes.fromExtras(null, "intelligence"))
        assertEquals(Route.Farm, IntentRoutes.fromExtras(null, "farm"))
        assertEquals(Route.Clients, IntentRoutes.fromExtras(null, "clients"))
        assertEquals(Route.Settings, IntentRoutes.fromExtras(null, "settings"))
        assertNull(IntentRoutes.fromExtras(null, null))
        assertNull(IntentRoutes.fromExtras("not-a-pin", null))
        assertNull(IntentRoutes.fromExtras(null, "unknown"))
    }

    @Test
    fun `plain launch maps to nothing`() {
        assertNull(IntentRoutes.parse(action = "android.intent.action.MAIN", dataString = null, sharedText = null, extraPin = null, extraRoute = null))
    }

    @Test
    fun `pin regex`() {
        assertTrue(IntentRoutes.isPin("0409_285.14_9"))
        assertTrue(IntentRoutes.isPin("1305_76_12"))
        assertTrue(IntentRoutes.isPin("0409_285.14&9"))
        assertFalse(IntentRoutes.isPin("409_1_1"))
        assertFalse(IntentRoutes.isPin("0409_"))
        assertFalse(IntentRoutes.isPin("0409_1/2"))
        assertFalse(IntentRoutes.isPin(null))
    }

    @Test
    fun `route names round trip their arguments`() {
        val listing = "https://a.example/x?y=1&z=2 3"
        assertEquals("scan?url=https%3A%2F%2Fa.example%2Fx%3Fy%3D1%26z%3D2%203", RouteNames.of(Route.Scan(listing)))
        assertEquals(listing, RouteNames.decode(RouteNames.encode(listing)))
        assertEquals("scan", RouteNames.of(Route.Scan(null)))
        assertEquals("property/0409_285.14_9", RouteNames.of(Route.Property("0409_285.14_9")))
        assertEquals("property/0409_285.14%269", RouteNames.of(Route.Property("0409_285.14&9")))
        assertEquals("search?q=Red%20Bank", RouteNames.of(Route.Search("Red Bank")))
        assertEquals("search", RouteNames.of(Route.Search("")))
        assertEquals("today", RouteNames.of(Route.Today))
        assertEquals(RouteNames.PROPERTY, RouteNames.patternOf(Route.Property("x")))
        assertTrue(RouteNames.isTabRoute(Route.Farm))
        assertFalse(RouteNames.isTabRoute(Route.Alerts))
    }

    @Test
    fun `decode keeps malformed escapes literally`() {
        assertEquals("100%", RouteNames.decode("100%"))
        assertEquals("a%zzb", RouteNames.decode("a%zzb"))
        assertEquals("café", RouteNames.decode("caf%C3%A9"))
    }
}
