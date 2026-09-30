package com.watchdogindex.agent.core

import com.watchdogindex.agent.core.api.ListingLinks
import com.watchdogindex.agent.core.sample.SampleData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The public site links: clean root-level WatchdogIndex URLs on the configured origin. */
class WatchdogConfigTest {

    @Test
    fun `production links are clean root-level watchdogindex URLs`() {
        val links = WatchdogConfig.Production.links
        assertEquals("https://www.watchdogindex.com", links.origin)
        assertEquals("watchdogindex.com", links.label)
        assertEquals("https://www.watchdogindex.com/agent/alex-moreno", links.agentPage("alex-moreno"))
        assertEquals("watchdogindex.com/agent/alex-moreno", links.agentPageLabel("alex-moreno"))
        assertEquals("https://www.watchdogindex.com/account/professional-profile", links.professionalProfile)
        assertEquals("https://www.watchdogindex.com/marketing-studio/postcards", links.postcardStudio)
        assertEquals("https://www.watchdogindex.com/newsletter-studio", links.newsletterStudio)
        listOf(links.agentPage("x"), links.professionalProfile, links.postcardStudio, links.newsletterStudio).forEach {
            assertTrue(!it.contains("/property/"), "public URLs are root-level: $it")
        }
    }

    @Test
    fun `agent page follows the account's vanity slug`() {
        val links = WatchdogConfig.Production.links
        assertEquals("https://www.watchdogindex.com/agent/${SampleData.AGENT_SLUG}", links.agentPage(SampleData.account))
        assertNull(links.agentPage(SampleData.account.copy(vanitySlug = null)))
        assertNull(links.agentPage(SampleData.account.copy(vanitySlug = "  ")))
        // Stray whitespace and slashes never make a double slash; anything else is escaped, never trusted raw.
        assertEquals("https://www.watchdogindex.com/agent/alex-moreno", links.agentPage(" /alex-moreno/ "))
        assertEquals("https://www.watchdogindex.com/agent/a%2Fb%3Fc", links.agentPage("a/b?c"))
    }

    @Test
    fun `onboarding, dashboard and property links are clean root-level routes`() {
        val links = WatchdogConfig.Production.links
        assertEquals("https://www.watchdogindex.com/onboarding", links.onboarding)
        assertEquals("https://www.watchdogindex.com/dashboard", links.dashboard)
        // A PIN alone: the site's short form, which it redirects to the canonical page.
        assertEquals("https://www.watchdogindex.com/nj/property/0409_285.14_9", links.property("0409_285.14_9"))
        assertEquals("https://www.watchdogindex.com/nj/property/0409_285.14_9", links.property(" 0409_285.14_9 "))
        // With the town and address: the canonical page the property route's `derived.links.property` names.
        assertEquals("https://www.watchdogindex.com/nj/harrison-town/102-grant-ave/0904_9_20", links.property("0904_9_20", "HARRISON TOWN", "102 GRANT AVE"))
        assertEquals(links.property("0904_9_20", "HARRISON TOWN", "102 GRANT AVE"), links.property("0904_9_20", "Harrison Town", "102 Grant Ave"), "raw MOD-IV and display strings slug the same")
        assertEquals(links.property("0904_9_20"), links.property("0904_9_20", "", null), "without a town or address the short form is used")
        for (url in listOf(links.onboarding, links.dashboard, links.property("0904_9_20"), links.property("0904_9_20", "HARRISON TOWN", "102 GRANT AVE"))) {
            assertFalse(url.endsWith("/"), "no trailing slash: $url")
            assertFalse(url.startsWith("${links.origin}/property/"), "never the /property/ implementation tree: $url")
            assertTrue(url.startsWith("https://www.watchdogindex.com/"), url)
        }
        // Both forms scan back to their PIN, so a shared link pasted into Scan opens the home.
        assertEquals("0409_285.14_9", ListingLinks.pinInWatchdogUrl(links.property("0409_285.14_9"))?.first)
        assertEquals("0904_9_20", ListingLinks.pinInWatchdogUrl(links.property("0904_9_20", "HARRISON TOWN", "102 GRANT AVE"))?.first)
    }

    @Test
    fun `links follow a different site origin`() {
        val links = WatchdogConfig(siteOrigin = "https://preview.example.test/").links
        assertEquals("preview.example.test", links.label)
        assertEquals("https://preview.example.test/agent/alex-moreno", links.agentPage("alex-moreno"))
        assertEquals("https://preview.example.test/account/professional-profile", links.professionalProfile)
        assertEquals("https://preview.example.test/onboarding", links.onboarding)
        assertEquals("https://preview.example.test/dashboard", links.dashboard)
        assertEquals("https://preview.example.test/nj/property/0904_9_20", links.property("0904_9_20"))
    }

    @Test
    fun `exception copy uses typographic apostrophes`() {
        assertEquals("Can’t reach Watchdog right now. Check your connection and try again.", NetworkException().userMessage)
        for (message in listOf(NetworkException().userMessage, NotSignedInException().userMessage, PlanRequiredException("farms").userMessage)) {
            assertFalse(message.contains('\''), "straight apostrophe in user-facing copy: $message")
        }
    }
}
