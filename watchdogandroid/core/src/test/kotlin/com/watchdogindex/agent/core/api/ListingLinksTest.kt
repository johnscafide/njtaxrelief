package com.watchdogindex.agent.core.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ListingLinksTest {

    @Test
    fun `zillow detail pages parse like the extension`() {
        val l = assertNotNull(ListingLinks.parseListing("https://www.zillow.com/homedetails/143-Harding-Rd-Red-Bank-NJ-07701/38200000_zpid/"))
        assertEquals(ListingLinks.Site.Zillow, l.site)
        assertEquals("143 Harding Rd Red Bank NJ", l.address)
        assertEquals("143", l.houseNumber)
        assertEquals("07701", l.zip)
        assertNull(l.town, "a Zillow slug does not separate the town from the street")
        assertNull(ListingLinks.parseListing("https://www.zillow.com/red-bank-nj/"), "search pages are not listings")
    }

    @Test
    fun `realtor and redfin detail pages parse like the extension`() {
        val r = assertNotNull(ListingLinks.parseListing("https://www.realtor.com/realestateandhomes-detail/12-Maple-Ave_Haddonfield_NJ_08033_M12345-67890"))
        assertEquals("12 Maple Ave, Haddonfield, NJ", r.address)
        assertEquals("Haddonfield", r.town)
        assertEquals("08033", r.zip)
        assertEquals("12 Maple Ave, Haddonfield, NJ 08033", r.display)
        val f = assertNotNull(ListingLinks.parseListing("https://www.redfin.com/NJ/Red-Bank/143-Harding-Rd-07701/home/36795123"))
        assertEquals("143 Harding Rd, Red Bank, NJ", f.address)
        assertEquals("Red Bank", f.town)
        assertEquals("07701", f.zip)
        assertNull(ListingLinks.parseListing("https://www.redfin.com/city/15828/NJ/Red-Bank"))
        assertNull(ListingLinks.parseListing("https://www.realtor.com/realestateandhomes-detail/12-Maple-Ave_Haddonfield_PA_19041_M1-2"), "only New Jersey")
    }

    @Test
    fun `plain text around a link is fine`() {
        val text = "Check out this home! https://www.zillow.com/homedetails/36-Birchwood-Dr-Cherry-Hill-NJ-08003/38412345_zpid/ via Zillow"
        val l = assertNotNull(ListingLinks.parseListing(text))
        assertEquals("36 Birchwood Dr Cherry Hill NJ", l.address)
        assertIs<ListingLinks.Payload.Listing>(ListingLinks.parsePayload(text))
    }

    @Test
    fun `sign QR payloads resolve to a pin when they carry one`() {
        val canonical = ListingLinks.parsePayload("https://www.watchdogindex.com/nj/harrison-town/102-grant-ave/0904_9_20")
        assertEquals(ListingLinks.Payload.Pin("0904_9_20", null, "watchdog_link"), canonical)
        val short = ListingLinks.parsePayload("https://watchdogindex.com/nj/property/0409_285.14_9")
        assertEquals("0409_285.14_9", (short as ListingLinks.Payload.Pin).pin)
        val trueCost = ListingLinks.parsePayload("https://www.watchdogindex.com/true-cost?pin=0409_285.14_9&agent=alex-moreno")
        assertEquals(ListingLinks.Payload.Pin("0409_285.14_9", "alex-moreno", "watchdog_link"), trueCost)
        val home = ListingLinks.parsePayload("https://www.watchdogindex.com/property/home?pams_pin=1340_76_12")
        assertEquals("1340_76_12", (home as ListingLinks.Payload.Pin).pin)
        assertEquals(ListingLinks.Payload.Pin("0409_285.14_9", null, "pin"), ListingLinks.parsePayload("0409_285.14_9"))
    }

    @Test
    fun `other Watchdog links and free text are classified honestly`() {
        val agent = ListingLinks.parsePayload("https://www.watchdogindex.com/agent/alex-moreno")
        assertIs<ListingLinks.Payload.NotAProperty>(agent)
        assertEquals("an agent page", agent.reason)
        assertIs<ListingLinks.Payload.NotAProperty>(ListingLinks.parsePayload("https://www.watchdogindex.com/open-house?code=ABC123"))
        assertIs<ListingLinks.Payload.NotAProperty>(ListingLinks.parsePayload("https://www.watchdogindex.com/property/?campaign=9f3e"))
        assertIs<ListingLinks.Payload.Address>(ListingLinks.parsePayload("102 Grant Ave, Harrison"))
        assertEquals(ListingLinks.Payload.Unrecognized, ListingLinks.parsePayload("hello there"))
        assertEquals(ListingLinks.Payload.Unrecognized, ListingLinks.parsePayload("https://example.com/whatever"))
    }
}
